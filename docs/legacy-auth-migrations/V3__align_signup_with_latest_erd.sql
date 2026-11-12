-- V2는 이미 적용된 원본을 유지한다. 회원가입 영역만 최신 ERD에 맞춘다.
-- 기존 행과 FK/인덱스/자동 증가 ID를 보존하는 이름 변경이다.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE user_auth_providers RENAME TO user_auth_accounts;
ALTER TABLE user_auth_accounts RENAME COLUMN auth_id TO auth_account_id;
ALTER TABLE user_auth_accounts RENAME COLUMN provider_user_id TO provider_subject;
ALTER TABLE user_auth_accounts RENAME COLUMN created_at TO linked_at;

ALTER TABLE user_terms_agreements ALTER COLUMN terms_version TYPE VARCHAR(20);

-- users.birth_date는 이전 버전의 데이터를 잃지 않도록 호환용으로 보존한다.
-- 신규 API와 엔티티에서는 사용하지 않는다. diaries 등 다른 도메인은 변경하지 않는다.
