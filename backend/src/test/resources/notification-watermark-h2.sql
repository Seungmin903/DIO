CREATE TABLE notification_read_watermarks (watermark_id UUID PRIMARY KEY, user_id BIGINT NOT NULL, created_at TIMESTAMP WITH TIME ZONE NOT NULL, expires_at TIMESTAMP WITH TIME ZONE NOT NULL, applied_at TIMESTAMP WITH TIME ZONE);
CREATE TABLE notification_read_watermark_items (watermark_id UUID NOT NULL, notification_id BIGINT NOT NULL, PRIMARY KEY (watermark_id, notification_id));
