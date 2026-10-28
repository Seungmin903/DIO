package com.f106.DIO.media.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.storage.MediaFiles;

/** 직접 삭제된 미디어 중 어느 테이블에서도 참조하지 않는 파일만 물리 삭제한다. */
@Service
public class ExpiredMediaCleanup {
	private static final Logger log = LoggerFactory.getLogger(ExpiredMediaCleanup.class);
	private static final int MAX_PAGES = 5;
	private final MediaFileRepository mediaFiles;
	private final MediaFiles files;
	private final Duration retention;
	private final int batchSize;

	public ExpiredMediaCleanup(MediaFileRepository mediaFiles, MediaFiles files,
		@Value("${dio.media.expiry-cleanup.retention:PT24H}") Duration retention,
		@Value("${dio.media.expiry-cleanup.batch-size:100}") int batchSize) {
		this.mediaFiles = mediaFiles;
		this.files = files;
		this.retention = retention;
		this.batchSize = batchSize;
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
		int deleted = 0;
		int failed = 0;
		int removedRows = 0;
		MediaFile last = null;
		for (int page = 0; page < MAX_PAGES && removedRows < batchSize; page++) {
			PageRequest limit = PageRequest.of(0, batchSize);
			List<MediaFile> candidates = last == null
				? mediaFiles.findPhysicallyDeletable(cutoff, limit)
				: mediaFiles.findPhysicallyDeletableAfter(cutoff, last.getDeletedAt(), last.getMediaFileId(), limit);
			for (MediaFile mediaFile : candidates) {
				last = mediaFile;
				if (removedRows >= batchSize) break;
				try {
					int removed = mediaFiles.deletePhysicallyIfDeletable(mediaFile.getMediaFileId(), cutoff);
					if (removed != 1) continue;
					removedRows++;

					try {
						files.delete(mediaFile.getStorageKey());
						deleted++;
					} catch (RuntimeException error) {
						failed++;
						// DB 행은 참조 경합을 막기 위해 먼저 삭제했다. 키는 운영 정리 대상으로 남긴다.
						log.error("Media database row was removed but storage cleanup failed: mediaFileId={}, key={}",
							mediaFile.getMediaFileId(), mediaFile.getStorageKey(), error);
					}
				} catch (RuntimeException error) {
					failed++;
					log.warn("Expired media cleanup failed: mediaFileId={}, key={}", mediaFile.getMediaFileId(), mediaFile.getStorageKey(), error);
				}
			}
			if (candidates.size() < batchSize) break;
		}
		return new Result(deleted, failed);
	}

	public record Result(int deleted, int failed) {}
}
