-- 꾸미기 공방 테이프 보관함(계정마다 폴더 구성 문서 한 벌). 사진 테이프 이미지는 media_files(TAPE)에 있다.
CREATE TABLE user_tape_libraries (
    user_id BIGINT NOT NULL,
    version BIGINT NOT NULL,
    document_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT pk_user_tape_libraries PRIMARY KEY (user_id),
    CONSTRAINT fk_user_tape_libraries_user FOREIGN KEY (user_id) REFERENCES users (user_id)
);

-- 보관함 문서에 든 미디어 id. 미디어 정리(MediaReferenceSql)가 참조로 본다.
CREATE TABLE user_tape_library_media (
    user_id BIGINT NOT NULL,
    media_file_id UUID NOT NULL,
    CONSTRAINT pk_user_tape_library_media PRIMARY KEY (user_id, media_file_id),
    CONSTRAINT fk_user_tape_library_media_user FOREIGN KEY (user_id) REFERENCES users (user_id),
    CONSTRAINT fk_user_tape_library_media_file FOREIGN KEY (media_file_id) REFERENCES media_files (media_file_id)
);
CREATE INDEX idx_user_tape_library_media_file ON user_tape_library_media (media_file_id);
