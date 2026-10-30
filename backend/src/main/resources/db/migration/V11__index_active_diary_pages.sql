-- Member list counts only live pages of one diary. Keep the count exact while
-- avoiding a full pages scan for every candidate in page-count sorting.
CREATE INDEX pages_active_diary_idx ON pages(diary_id) WHERE deleted_at IS NULL;
