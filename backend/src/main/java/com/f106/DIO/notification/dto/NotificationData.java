package com.f106.DIO.notification.dto;

import java.time.Instant;
import java.util.UUID;

public record NotificationData(String notificationId, String notificationType, String actorUserId,
	UUID diaryId, UUID pageId, Instant readAt, Instant createdAt) {
}
