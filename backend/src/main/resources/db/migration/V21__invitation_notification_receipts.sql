-- 초대 알림 재전달·동시 수신·삭제 후 재생성을 방지하는 처리 이력.
CREATE TABLE invitation_notification_receipts (
    event_id UUID NOT NULL,
    recipient_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    invite_id BIGINT NOT NULL,
    event_occurred_at TIMESTAMPTZ(6) NOT NULL,
    outcome VARCHAR(30) NOT NULL,
    notification_id BIGINT REFERENCES notifications(notification_id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ(6) NOT NULL,
    PRIMARY KEY (event_id, recipient_user_id),
    UNIQUE (event_id),
    UNIQUE (invite_id, recipient_user_id),
    CHECK (outcome IN ('PROCESSING', 'CREATED', 'SKIPPED_REVOKED', 'SKIPPED_EXPIRED', 'SKIPPED_INELIGIBLE'))
);

CREATE INDEX idx_invitation_notification_receipts_notification
    ON invitation_notification_receipts(notification_id);
