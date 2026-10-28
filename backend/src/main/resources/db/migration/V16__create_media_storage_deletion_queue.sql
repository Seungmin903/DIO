-- 미디어 DB 행을 물리 삭제한 뒤 저장소 원본 삭제에 실패했을 때 재시도할 대상을 보존한다.
-- media_files와 FK를 맺지 않는다. 원본 행은 이 행을 넣는 같은 트랜잭션에서 삭제된다.

CREATE TABLE media_storage_deletion_queue (
    deletion_id UUID PRIMARY KEY,
    media_file_id UUID NOT NULL,
    storage_key VARCHAR(500) NOT NULL UNIQUE,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    last_error VARCHAR(1000)
);

CREATE INDEX idx_media_storage_deletion_queue_queued_at
    ON media_storage_deletion_queue (queued_at, deletion_id);

COMMENT ON TABLE media_storage_deletion_queue IS '물리 삭제된 미디어 원본의 저장소 삭제 재시도 대기열';
