-- 휴지통 보존 기간이 끝난 다이어리를 물리 삭제할 때, 다이어리에 종속된 데이터만 함께 정리한다.
-- media_files 원본은 CASCADE 대상이 아니다. 별도 미디어 정리 작업이 참조 여부를 확인한 뒤 삭제한다.

ALTER TABLE "pages" DROP CONSTRAINT "FK_diaries_TO_pages_1";
ALTER TABLE "pages" ADD CONSTRAINT "FK_diaries_TO_pages_1"
    FOREIGN KEY ("diary_id") REFERENCES "diaries" ("diary_id") ON DELETE CASCADE;

ALTER TABLE "diary_members" DROP CONSTRAINT "FK_diaries_TO_diary_members_1";
ALTER TABLE "diary_members" ADD CONSTRAINT "FK_diaries_TO_diary_members_1"
    FOREIGN KEY ("diary_id") REFERENCES "diaries" ("diary_id") ON DELETE CASCADE;

ALTER TABLE "diary_invites" DROP CONSTRAINT "FK_diaries_TO_diary_invites_1";
ALTER TABLE "diary_invites" ADD CONSTRAINT "FK_diaries_TO_diary_invites_1"
    FOREIGN KEY ("diary_id") REFERENCES "diaries" ("diary_id") ON DELETE CASCADE;

ALTER TABLE "diary_handwriting_fonts" DROP CONSTRAINT "FK_diaries_TO_diary_handwriting_fonts_1";
ALTER TABLE "diary_handwriting_fonts" ADD CONSTRAINT "FK_diaries_TO_diary_handwriting_fonts_1"
    FOREIGN KEY ("diary_id") REFERENCES "diaries" ("diary_id") ON DELETE CASCADE;

ALTER TABLE "diary_media_library" DROP CONSTRAINT "FK_diaries_TO_diary_media_library_1";
ALTER TABLE "diary_media_library" ADD CONSTRAINT "FK_diaries_TO_diary_media_library_1"
    FOREIGN KEY ("diary_id") REFERENCES "diaries" ("diary_id") ON DELETE CASCADE;

ALTER TABLE "canvas_elements" DROP CONSTRAINT "FK_pages_TO_canvas_elements_1";
ALTER TABLE "canvas_elements" ADD CONSTRAINT "FK_pages_TO_canvas_elements_1"
    FOREIGN KEY ("page_id") REFERENCES "pages" ("page_id") ON DELETE CASCADE;

ALTER TABLE "element_strokes" DROP CONSTRAINT "FK_canvas_elements_TO_element_strokes_1";
ALTER TABLE "element_strokes" ADD CONSTRAINT "FK_canvas_elements_TO_element_strokes_1"
    FOREIGN KEY ("element_id") REFERENCES "canvas_elements" ("element_id") ON DELETE CASCADE;

ALTER TABLE "canvas_history_operations" DROP CONSTRAINT "FK_pages_TO_canvas_history_operations_1";
ALTER TABLE "canvas_history_operations" ADD CONSTRAINT "FK_pages_TO_canvas_history_operations_1"
    FOREIGN KEY ("page_id") REFERENCES "pages" ("page_id") ON DELETE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT "FK_diaries_TO_notifications_1";
ALTER TABLE "notifications" ADD CONSTRAINT "FK_diaries_TO_notifications_1"
    FOREIGN KEY ("diary_id") REFERENCES "diaries" ("diary_id") ON DELETE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT "FK_pages_TO_notifications_1";
ALTER TABLE "notifications" ADD CONSTRAINT "FK_pages_TO_notifications_1"
    FOREIGN KEY ("page_id") REFERENCES "pages" ("page_id") ON DELETE CASCADE;

CREATE INDEX "idx_diaries_deleted_at" ON "diaries" ("deleted_at") WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "idx_media_files_deleted_at" ON "media_files" ("deleted_at") WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "idx_canvas_elements_media_file_id" ON "canvas_elements" ("media_file_id") WHERE "media_file_id" IS NOT NULL;
CREATE INDEX "idx_diary_handwriting_fonts_media_file_id" ON "diary_handwriting_fonts" ("font_media_file_id");
CREATE INDEX "idx_diary_media_library_media_file_id" ON "diary_media_library" ("media_file_id");
CREATE INDEX "idx_ai_jobs_source_media_file_id" ON "ai_jobs" ("source_media_file_id");
CREATE INDEX "idx_ai_jobs_result_media_file_id" ON "ai_jobs" ("result_media_file_id");
