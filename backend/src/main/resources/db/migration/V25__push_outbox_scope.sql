-- 별도 환경과 앱의 워커가 서로의 대기열을 소비하지 않도록 범위를 기록한다.
-- 기존 범위 미지정 행은 자동 발송하지 않으며 운영자가 확인한다.
ALTER TABLE push_outbox ADD COLUMN environment VARCHAR(32);
ALTER TABLE push_outbox ADD COLUMN app_id VARCHAR(160);
ALTER TABLE push_outbox ADD CONSTRAINT push_outbox_scope_pair CHECK ((environment IS NULL) = (app_id IS NULL));
CREATE INDEX idx_push_outbox_scope_due ON push_outbox(environment, app_id, status, created_at);

-- 발송 대기 TTL과 별개로 Expo 접수 이후 receipt 확인 기간을 계산한다.
ALTER TABLE push_deliveries ADD COLUMN accepted_at TIMESTAMPTZ(6);
