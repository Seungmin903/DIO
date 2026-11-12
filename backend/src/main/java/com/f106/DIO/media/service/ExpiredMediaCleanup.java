package com.f106.DIO.media.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.f106.DIO.global.logging.RedactedThrowable;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaStorageDeletionTask;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.storage.MediaFiles;

/** 직접 삭제된 미디어 중 어느 테이블에서도 참조하지 않는 파일만 물리 삭제한다. */
@Service
public class ExpiredMediaCleanup {
	private static final Logger log = LoggerFactory.getLogger(ExpiredMediaCleanup.class);
	private static final int MAX_PAGES = 5;
	private final MediaFileRepository mediaFiles;
	private final MediaStorageDeletionQueueService deletionQueue;
	private final MediaFiles files;
	private final GuardedMediaOperations guarded;
	private final Duration retention;
	private final int batchSize;

	public ExpiredMediaCleanup(MediaFileRepository mediaFiles, MediaStorageDeletionQueueService deletionQueue, MediaFiles files, GuardedMediaOperations guarded,
		@Value("${dio.media.expiry-cleanup.retention:PT24H}") Duration retention,
		@Value("${dio.media.expiry-cleanup.batch-size:100}") int batchSize) {
		this.mediaFiles = mediaFiles;
		this.deletionQueue = deletionQueue;
		this.files = files;
		this.guarded = guarded;
		this.retention = retention;
		this.batchSize = Math.max(1, Math.min(100, batchSize));
	}

	public Result purgeExpired() {
		return purgeExpiredAt(Instant.now());
	}

	/**
	 * DB 삭제가 계속 실패하는 행이 매번 앞쪽에 와도 뒤의 후보를 처리하도록 커서로 넘어간다.
	 * 한 번 실행에 DB 행을 최대 batchSize개 지우고, 후보는 최대 batchSize * MAX_PAGES개까지만 본다.
	 */
	Result purgeExpiredAt(Instant now) {
		Instant cutoff = now.minus(retention);
		Result queuedResult = retryQueuedStorageDeletes();
		int deleted = queuedResult.deleted();
		int failed = queuedResult.failed();
		int remaining = batchSize - queuedResult.attempted();
		if (remaining <= 0) return new Result(deleted, failed);
		int removedRows = 0;
		MediaFile last = null;
		for (int page = 0; page < MAX_PAGES && removedRows < remaining; page++) {
			PageRequest limit = PageRequest.of(0, remaining);
			List<MediaFile> candidates = last == null
				? mediaFiles.findPhysicallyDeletable(cutoff, limit)
				: mediaFiles.findPhysicallyDeletableAfter(cutoff, last.cleanupSince(), last.getMediaFileId(), limit);
			for (MediaFile mediaFile : candidates) {
				last = mediaFile;
				if (removedRows >= remaining) break;
				try {
					MediaStorageDeletionTask task = deletionQueue.enqueueAfterPhysicalDelete(mediaFile, cutoff);
					if (task == null) continue;
					removedRows++;
					Result result = deleteStorage(task);
					deleted += result.deleted();
					failed += result.failed();
				} catch (RuntimeException error) {
					failed++;
					// 예외 메시지에는 DB 제약 위반 값(storage_key 등)이 들어갈 수 있어, 이 클래스의 실패 로그는 메시지를 뺀 스택 트레이스만 남긴다.
					log.warn("Expired media cleanup failed: mediaFileId={}, errorType={}", mediaFile.getMediaFileId(), error.getClass().getSimpleName(), RedactedThrowable.of(error));
				}
			}
			if (candidates.size() < remaining) break;
		}
		return new Result(deleted, failed);
	}

	private Result retryQueuedStorageDeletes() {
		int deleted = 0;
		int failed = 0;
		List<MediaStorageDeletionTask> tasks = deletionQueue.next(Math.max(1, batchSize / 2));
		for (MediaStorageDeletionTask task : tasks) {
			Result result = deleteStorage(task);
			deleted += result.deleted();
			failed += result.failed();
		}
		return new Result(deleted, failed, tasks.size());
	}

	private Result deleteStorage(MediaStorageDeletionTask task) {
		try {
			return new Result(guarded.deleteIfUnlocked(task.getDeletionId()) ? 1 : 0, 0);
		} catch (RuntimeException error) {
			try {
				deletionQueue.recordFailure(task, error);
			} catch (RuntimeException queueError) {
				log.error("Media storage deletion retry could not be recorded: deletionId={}, errorType={}", task.getDeletionId(), queueError.getClass().getSimpleName(), RedactedThrowable.of(queueError));
			}
			log.warn("Media storage deletion failed and will be retried: deletionId={}, mediaFileId={}, errorType={}",
				task.getDeletionId(), task.getMediaFileId(), error.getClass().getSimpleName(), RedactedThrowable.of(error));
			return new Result(0, 1);
		}
	}

	public record Result(int deleted, int failed, int attempted) {
		public Result(int deleted, int failed) { this(deleted, failed, 0); }
	}
}
