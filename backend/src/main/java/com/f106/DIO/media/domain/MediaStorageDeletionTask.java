package com.f106.DIO.media.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** DB 행은 지워졌지만 저장소 원본 삭제가 끝나지 않은 미디어를 재시도한다. */
@Entity
@Table(name = "media_storage_deletion_queue")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MediaStorageDeletionTask {
	@Id
	@Column(name = "deletion_id", nullable = false)
	private UUID deletionId;
	@Column(name = "media_file_id", nullable = false)
	private UUID mediaFileId;
	@Column(name = "storage_key", nullable = false, unique = true, length = 500)
	private String storageKey;
	@Column(name = "queued_at", nullable = false, updatable = false)
	private Instant queuedAt;
	@Column(name = "attempt_count", nullable = false)
	private int attemptCount;
	@Column(name = "last_attempt_at")
	private Instant lastAttemptAt;
	@Column(name = "next_attempt_at", nullable = false)
	private Instant nextAttemptAt;
	@Column(name = "last_error", length = 1000)
	private String lastError;

	public MediaStorageDeletionTask(UUID mediaFileId, String storageKey) {
		this(mediaFileId, storageKey, Instant.now());
	}

	public MediaStorageDeletionTask(UUID mediaFileId, String storageKey, Instant nextAttemptAt) {
		this.deletionId = UUID.randomUUID();
		this.mediaFileId = mediaFileId;
		this.storageKey = storageKey;
		this.queuedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
		this.nextAttemptAt = nextAttemptAt.truncatedTo(ChronoUnit.MICROS);
	}

	public void recordFailure(String error) {
		attemptCount++;
		lastAttemptAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
		long delayMinutes = 1L << Math.min(attemptCount - 1, 6);
		nextAttemptAt = lastAttemptAt.plus(delayMinutes, ChronoUnit.MINUTES);
		lastError = error == null ? null : error.substring(0, Math.min(error.length(), 1000));
	}
}
