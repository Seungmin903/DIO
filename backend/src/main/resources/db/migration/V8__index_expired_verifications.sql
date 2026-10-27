-- 주기 정리의 만료 후보 조회를 지원한다. 기존 행은 변경하지 않는다.
CREATE INDEX signup_verification_expiry_idx ON signup_email_verifications(expires_at);
CREATE INDEX password_reset_verification_expiry_idx ON password_reset_verifications(expires_at);
