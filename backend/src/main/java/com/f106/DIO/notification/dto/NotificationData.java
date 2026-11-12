package com.f106.DIO.notification.dto;

import java.time.Instant;
import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(requiredProperties = {"notificationId", "notificationType", "actorUserId", "diaryId", "pageId", "readAt", "createdAt"})
public record NotificationData(String notificationId, String notificationType,
	@Schema(types = {"string", "null"}, description = "발신자 정보가 없으면 null") String actorUserId,
	@Schema(types = {"string", "null"}, format = "uuid", description = "연결 다이어리가 없으면 null") UUID diaryId,
	@Schema(types = {"string", "null"}, format = "uuid", description = "연결 페이지가 없으면 null") UUID pageId,
	@Schema(types = {"string", "null"}, format = "date-time", description = "미읽음이면 null") Instant readAt,
	Instant createdAt) {
}
