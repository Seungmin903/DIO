-- 꾸미기 공방 내 속지 보관함(계정마다 속지 목록 · 기본 속지 스타일 문서 한 벌). PDF 쪽 그림은 media_files 에 있다.
CREATE TABLE user_paper_libraries (
    user_id BIGINT NOT NULL,
    version BIGINT NOT NULL,
    document_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT pk_user_paper_libraries PRIMARY KEY (user_id),
    CONSTRAINT fk_user_paper_libraries_user FOREIGN KEY (user_id) REFERENCES users (user_id)
);

-- 보관함 문서에 든 미디어 id. 미디어 정리(MediaReferenceSql)가 참조로 본다.
CREATE TABLE user_paper_library_media (
    user_id BIGINT NOT NULL,
    media_file_id UUID NOT NULL,
    CONSTRAINT pk_user_paper_library_media PRIMARY KEY (user_id, media_file_id),
    CONSTRAINT fk_user_paper_library_media_user FOREIGN KEY (user_id) REFERENCES users (user_id),
    CONSTRAINT fk_user_paper_library_media_file FOREIGN KEY (media_file_id) REFERENCES media_files (media_file_id)
);
CREATE INDEX idx_user_paper_library_media_file ON user_paper_library_media (media_file_id);
