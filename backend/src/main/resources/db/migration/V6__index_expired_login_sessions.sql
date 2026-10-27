-- 만료된 세션만 제한된 배치로 정리하며 활성·미만료 폐기 세션의 재사용 탐지 이력은 유지한다.
CREATE INDEX refresh_tokens_expiry_id_idx ON refresh_tokens(expires_at, token_id);
