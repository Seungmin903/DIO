-- 보존 기한 정리 작업의 조건·정렬을 그대로 받치는 인덱스.
-- 알림: 1시간마다 deleted_at<=? order by deleted_at,notification_id limit 500 (NotificationRepository.purgeDeletedBefore)
CREATE INDEX idx_notifications_deleted_retention
    ON notifications(deleted_at, notification_id)
    WHERE deleted_at IS NOT NULL;

-- 푸시: 1분마다 30일 지난 행을 500건씩 지운다 (PushRegistrationCleanup.clearExpired).
-- 기존 idx_push_registration_expiry는 encrypted_response IS NOT NULL 부분 인덱스라 삭제 조건을 받치지 못한다.
CREATE INDEX idx_push_registration_requests_retention
    ON push_registration_requests(expires_at);
CREATE INDEX idx_push_mutation_requests_retention
    ON push_mutation_requests(created_at);
CREATE INDEX idx_push_installations_disabled_retention
    ON push_installations(disabled_at)
    WHERE enabled = false AND disabled_at IS NOT NULL;
