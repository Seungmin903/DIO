package com.f106.DIO.moderation.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 보관 기간이 끝난 신고의 증빙 파일을 저장소 장애 후에도 재시도할 수 있게 보존한다. */
@Entity
@Table(name = "report_evidence_deletion_queue")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReportEvidenceDeletionTask {
    @Id @Column(name = "deletion_id", nullable = false) private UUID deletionId;
    @Column(name = "report_id", nullable = false) private long reportId;
    @Column(name = "storage_key", nullable = false, unique = true, length = 500) private String storageKey;
    @Column(name = "queued_at", nullable = false, updatable = false) private Instant queuedAt;
    @Column(name = "attempt_count", nullable = false) private int attemptCount;
    @Column(name = "last_attempt_at") private Instant lastAttemptAt;
    @Column(name = "next_attempt_at", nullable = false) private Instant nextAttemptAt;
    @Column(name = "last_error", length = 1000) private String lastError;
    public ReportEvidenceDeletionTask(long reportId, String storageKey) { deletionId=UUID.randomUUID();this.reportId=reportId;this.storageKey=storageKey;queuedAt=nextAttemptAt=Instant.now().truncatedTo(ChronoUnit.MICROS); }
    public void recordFailure(String error) { attemptCount++;lastAttemptAt=Instant.now().truncatedTo(ChronoUnit.MICROS);nextAttemptAt=lastAttemptAt.plus(1L << Math.min(attemptCount-1,6),ChronoUnit.MINUTES);lastError=error==null?null:error.substring(0,Math.min(error.length(),1000)); }
}
