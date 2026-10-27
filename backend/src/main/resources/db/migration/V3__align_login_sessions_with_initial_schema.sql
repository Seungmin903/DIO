-- V1의 세션 행을 보존하면서 현재 로그인 API의 해시·기기 세션 모델로 확장한다.
ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_token_hash_check;
ALTER TABLE refresh_tokens ALTER COLUMN token_hash TYPE CHAR(64) USING encode(token_hash, 'hex')::CHAR(64);
ALTER TABLE refresh_tokens ADD COLUMN session_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_session_id_unique UNIQUE (session_id);
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_token_hash_unique UNIQUE (token_hash);
ALTER TABLE refresh_tokens DROP CONSTRAINT "FK_users_TO_refresh_tokens_1";
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens(user_id);
CREATE TABLE refresh_token_history (
    token_hash CHAR(64) PRIMARY KEY,
    token_id BIGINT NOT NULL REFERENCES refresh_tokens(token_id) ON DELETE CASCADE,
    rotated_at TIMESTAMPTZ NOT NULL
);
