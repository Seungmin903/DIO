-- Bounded keyset scans include only trashed member-owned diaries. Existing rows are preserved.
CREATE INDEX diaries_expiry_cleanup_idx ON diaries (deleted_at, diary_id)
    WHERE deleted_at IS NOT NULL AND owner_user_id IS NOT NULL;
