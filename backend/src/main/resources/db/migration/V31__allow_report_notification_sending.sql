-- Preserve the V30 checksum for databases where report tables already exist.
ALTER TABLE user_reports DROP CONSTRAINT ck_report_notification;
ALTER TABLE user_reports ADD CONSTRAINT ck_report_notification
 CHECK (notification_status IN ('PENDING','SENDING','SENT','FAILED'));
