-- 처리 완료 신고는 30일 뒤 삭제하며, 증빙 파일은 저장소 삭제 재시도 대기열로 넘긴다.
CREATE INDEX ix_report_resolved_retention ON user_reports (resolved_at, report_id) WHERE status IN ('RESOLVED', 'DISMISSED');
CREATE TABLE report_evidence_deletion_queue (
 deletion_id UUID PRIMARY KEY, report_id BIGINT NOT NULL, storage_key VARCHAR(500) NOT NULL UNIQUE,
 queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, attempt_count INTEGER NOT NULL DEFAULT 0,
 last_attempt_at TIMESTAMPTZ, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, last_error VARCHAR(1000)
);
CREATE INDEX ix_report_evidence_deletion_due ON report_evidence_deletion_queue (next_attempt_at, deletion_id);
COMMENT ON TABLE report_evidence_deletion_queue IS '삭제된 신고 증빙 파일의 저장소 삭제 재시도 대기열';
