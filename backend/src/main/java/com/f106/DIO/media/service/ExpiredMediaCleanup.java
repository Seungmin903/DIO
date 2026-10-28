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

	Result purgeExpiredAt(Instant now) {
		Instant cutoff = now.minus(retention);
		List<MediaFile> candidates = mediaFiles.findPhysicallyDeletable(cutoff, PageRequest.of(0, batchSize));
		int deleted = 0;
		int failed = 0;
		for (MediaFile mediaFile : candidates) {
			try {
				// 현재·향후 연결 경로는 deletedAt이 null인 미디어만 허용한다. 현재 캔버스 API도 mediaFileId를 거절한다.
				files.delete(mediaFile.getStorageKey());
				int removed = mediaFiles.deletePhysicallyIfDeletable(mediaFile.getMediaFileId(), cutoff);
				if (removed == 1) deleted++;
				else log.error("Media reference appeared after storage cleanup; mediaFileId={}", mediaFile.getMediaFileId());
			} catch (RuntimeException error) {
				failed++;
				log.warn("Expired media cleanup failed: mediaFileId={}, key={}", mediaFile.getMediaFileId(), mediaFile.getStorageKey(), error);
			}
		}
		return new Result(deleted, failed);
	}

	public record Result(int deleted, int failed) {}
}
