-- Creation and its receipt commit together. No expiration: old keys must not silently create a second diary.
CREATE TABLE diary_creation_receipts (
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    key_hash CHAR(64) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    diary_id UUID REFERENCES diaries(diary_id) ON DELETE SET NULL,
    response_body JSONB,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ(6),
    PRIMARY KEY(user_id, key_hash),
    CONSTRAINT diary_creation_receipt_state CHECK (
        (response_body IS NULL AND completed_at IS NULL AND diary_id IS NULL)
        OR (completed_at IS NOT NULL AND (
            (response_body IS NOT NULL AND diary_id IS NOT NULL)
            OR (response_body IS NULL AND diary_id IS NULL)
        ))
    )
);
CREATE INDEX diary_creation_receipts_diary_idx ON diary_creation_receipts(diary_id) WHERE diary_id IS NOT NULL;

-- Keep a key tombstone after permanent deletion, but remove the original title/response snapshot.
CREATE FUNCTION scrub_deleted_diary_creation_receipt() RETURNS TRIGGER LANGUAGE plpgsql AS $scrub_receipt$
BEGIN
    IF OLD.diary_id IS NOT NULL AND NEW.diary_id IS NULL THEN
        NEW.response_body := NULL;
    END IF;
    RETURN NEW;
END
$scrub_receipt$;
CREATE TRIGGER diary_creation_receipt_scrub
    BEFORE UPDATE OF diary_id ON diary_creation_receipts
    FOR EACH ROW EXECUTE FUNCTION scrub_deleted_diary_creation_receipt();
