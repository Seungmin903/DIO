-- Owner-only completion tombstone. No FK to the deleted diary or media objects.
CREATE TABLE diary_purge_receipts (
    diary_id UUID PRIMARY KEY,
    owner_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX diary_purge_receipts_owner_idx ON diary_purge_receipts(owner_user_id);
