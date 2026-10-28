-- Completion tombstone: no diary FK and no deleted content. Repeated requests are authorized to the original owner only.
CREATE TABLE diary_purge_receipts (
    diary_id UUID PRIMARY KEY,
    owner_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL
);
