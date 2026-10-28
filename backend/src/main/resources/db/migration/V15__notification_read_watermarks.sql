-- 전체 읽음 준비 시 실제로 보인 미읽음 알림 ID를 고정한다.
-- 생성 시각/최대 ID 경계만으로는 늦게 커밋된 INSERT를 배제할 수 없다.
CREATE TABLE notification_read_watermarks (
    watermark_id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ(6) NOT NULL,
    expires_at TIMESTAMPTZ(6) NOT NULL,
    applied_at TIMESTAMPTZ(6)
);

CREATE INDEX idx_notification_read_watermarks_user_expiry
    ON notification_read_watermarks(user_id, expires_at);
CREATE INDEX idx_notification_read_watermarks_expiry
    ON notification_read_watermarks(expires_at);

CREATE TABLE notification_read_watermark_items (
    watermark_id UUID NOT NULL REFERENCES notification_read_watermarks(watermark_id) ON DELETE CASCADE,
    notification_id BIGINT NOT NULL REFERENCES notifications(notification_id) ON DELETE CASCADE,
    PRIMARY KEY (watermark_id, notification_id)
);

CREATE INDEX idx_notification_read_watermark_items_notification
    ON notification_read_watermark_items(notification_id);
