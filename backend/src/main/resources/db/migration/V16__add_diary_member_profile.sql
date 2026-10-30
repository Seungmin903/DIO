-- Approved ERD addition only: preserve existing users, diaries and media rows.
ALTER TABLE diary_members ADD COLUMN IF NOT EXISTS member_nickname VARCHAR(30);
ALTER TABLE diary_members ADD COLUMN IF NOT EXISTS member_profile_photo_id UUID;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_diary_member_profile_media' AND conrelid = 'diary_members'::regclass) THEN
        ALTER TABLE diary_members ADD CONSTRAINT fk_diary_member_profile_media
            FOREIGN KEY (member_profile_photo_id) REFERENCES media_files(media_file_id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_diary_member_profile_media ON diary_members(member_profile_photo_id)
    WHERE member_profile_photo_id IS NOT NULL;
