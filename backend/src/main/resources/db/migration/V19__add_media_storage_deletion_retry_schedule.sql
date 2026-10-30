-- 대기열 앞부분의 반복 실패가 새 만료 미디어 정리를 막지 않게 재시도 시점을 분리한다.

ALTER TABLE media_storage_deletion_queue ADD COLUMN next_attempt_at TIMESTAMPTZ;
UPDATE media_storage_deletion_queue SET next_attempt_at = queued_at WHERE next_attempt_at IS NULL;
ALTER TABLE media_storage_deletion_queue ALTER COLUMN next_attempt_at SET NOT NULL;

CREATE INDEX idx_media_storage_deletion_queue_next_attempt
    ON media_storage_deletion_queue (next_attempt_at, deletion_id);
