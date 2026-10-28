CREATE INDEX IF NOT EXISTS idx_media_files_owner_active_created
    ON media_files (owner_user_id, created_at DESC)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN media_files.media_type IS 'IMAGE | AUDIO | FONT';
COMMENT ON COLUMN media_files.library_category IS 'PHOTO | STICKER | TAPE | AUDIO';
