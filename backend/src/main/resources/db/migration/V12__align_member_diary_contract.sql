-- Preserve V1~V11 and all existing keys, page IDs and content.
ALTER TABLE diaries ADD COLUMN version BIGINT NOT NULL DEFAULT 1 CHECK(version > 0);
-- Reserve version 1 for original creation snapshots. Pre-version metadata must require a fresh GET.
UPDATE diaries SET version=2;
ALTER TABLE diary_creation_receipts DROP CONSTRAINT diary_creation_receipt_state;
-- An expired response may be scrubbed while the live diary FK and key tombstone remain.
ALTER TABLE diary_creation_receipts ADD CONSTRAINT diary_creation_receipt_state CHECK (
    (response_body IS NULL AND completed_at IS NULL AND diary_id IS NULL)
    OR (completed_at IS NOT NULL AND (response_body IS NULL OR diary_id IS NOT NULL))
);
CREATE INDEX diary_creation_receipts_completed_idx ON diary_creation_receipts(completed_at)
    WHERE response_body IS NOT NULL;
