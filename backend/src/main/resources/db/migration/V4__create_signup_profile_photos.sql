-- 회원가입 사진 전용. 기존 users/미디어/다이어리 테이블과 적용된 V1~V3는 변경하지 않는다.
CREATE TABLE signup_profile_photos (
    photo_id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    image_bytes BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT signup_profile_photo_size CHECK (octet_length(image_bytes) BETWEEN 1 AND 1048576)
);
