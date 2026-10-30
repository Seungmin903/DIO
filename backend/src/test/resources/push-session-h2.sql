-- 테스트 전용 최소 fixture: 운영 V23 스키마와 함께 유지한다.
CREATE TABLE IF NOT EXISTS push_installations (
 installation_id UUID PRIMARY KEY, user_id BIGINT NOT NULL, session_id UUID NOT NULL,
 binding_version BIGINT NOT NULL, enabled BOOLEAN NOT NULL, disabled_at TIMESTAMP WITH TIME ZONE,
 updated_at TIMESTAMP WITH TIME ZONE
);
CREATE TABLE IF NOT EXISTS push_deliveries (
 installation_id UUID NOT NULL, binding_version BIGINT NOT NULL, status VARCHAR(24) NOT NULL,
 lease_id UUID, lease_until TIMESTAMP WITH TIME ZONE
);
