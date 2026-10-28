-- 회원가입 인증과 별도 저장한다. 기존 회원/다이어리/인증 행은 변경하지 않는다.
CREATE TABLE password_reset_verifications (
    email VARCHAR(255) PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    token_hash CHAR(64) UNIQUE,
    token_expires_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ
);
CREATE INDEX password_reset_user_id_idx ON password_reset_verifications(user_id);
