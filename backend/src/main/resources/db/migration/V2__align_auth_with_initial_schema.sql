-- develop의 initial schema V1을 유지하고 인증 기능에 필요한 제약·검증 테이블만 추가한다.
-- 기존 사용자·다이어리·회원 ID와 FK는 보존한다. 중복 데이터는 삭제/임의 변경하지 않고 적용을 중단한다.
ALTER TABLE users ADD COLUMN nickname_key VARCHAR(30);
UPDATE users SET nickname_key = lower(nickname);
ALTER TABLE users ALTER COLUMN nickname_key SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_nickname_key_unique UNIQUE (nickname_key);
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
-- V1의 profile_img는 다른 기능 호환을 위해 그대로 둔다.
ALTER TABLE users ADD COLUMN profile_color CHAR(7) NOT NULL DEFAULT '#6F9FC6';
ALTER TABLE user_auth_accounts ADD CONSTRAINT user_auth_accounts_provider_subject_unique UNIQUE (provider, provider_subject);
ALTER TABLE user_auth_accounts ADD CONSTRAINT user_auth_accounts_user_provider_unique UNIQUE (user_id, provider);

CREATE TABLE signup_email_verifications (
    email VARCHAR(255) PRIMARY KEY,
    code_hash CHAR(64) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    token_hash CHAR(64),
    token_expires_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ
);
