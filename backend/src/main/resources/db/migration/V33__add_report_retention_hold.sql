-- Existing reports remain eligible unless an operator explicitly records a legal hold.
ALTER TABLE user_reports ADD COLUMN retention_hold BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_reports ADD COLUMN retention_hold_reason VARCHAR(1000);
ALTER TABLE user_reports ADD COLUMN retention_hold_by VARCHAR(100);
ALTER TABLE user_reports ADD COLUMN retention_hold_at TIMESTAMPTZ;
ALTER TABLE user_reports ADD CONSTRAINT ck_report_retention_hold CHECK (
 (retention_hold AND retention_hold_reason IS NOT NULL AND btrim(retention_hold_reason) <> ''
  AND retention_hold_by IS NOT NULL AND btrim(retention_hold_by) <> '' AND retention_hold_at IS NOT NULL)
 OR (NOT retention_hold AND retention_hold_reason IS NULL AND retention_hold_by IS NULL AND retention_hold_at IS NULL)
);
COMMENT ON COLUMN user_reports.retention_hold IS '운영자가 설정하는 자동 파기 제외 여부. 완료 신고도 보존 해제 전 삭제하지 않는다.';
