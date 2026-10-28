-- 파일 라이브러리 분류와 미디어 보존 정리에 필요한 조회 인덱스를 추가한다.

CREATE INDEX IF NOT EXISTS idx_media_files_owner_active_created
    ON media_files (owner_user_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_media_files_deleted_at ON media_files (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_canvas_elements_media_file_id ON canvas_elements (media_file_id) WHERE media_file_id IS NOT NULL;
CREATE INDEX idx_diary_handwriting_fonts_media_file_id ON diary_handwriting_fonts (font_media_file_id);
CREATE INDEX idx_diary_media_library_media_file_id ON diary_media_library (media_file_id);
CREATE INDEX idx_ai_jobs_source_media_file_id ON ai_jobs (source_media_file_id);
CREATE INDEX idx_ai_jobs_result_media_file_id ON ai_jobs (result_media_file_id);

COMMENT ON COLUMN media_files.media_type IS 'IMAGE | AUDIO | FONT';
COMMENT ON COLUMN media_files.library_category IS 'PHOTO | STICKER | TAPE | AUDIO';
