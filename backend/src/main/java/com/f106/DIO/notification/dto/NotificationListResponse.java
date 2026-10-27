package com.f106.DIO.notification.dto;

import java.util.List;
import io.swagger.v3.oas.annotations.media.Schema;

import com.f106.DIO.notification.invitation.InvitationLookup.InvitationTarget;

@Schema(requiredProperties = {"items", "nextCursor", "hasNext"})
public record NotificationListResponse(List<Item> items,
	@Schema(types = {"string", "null"}, description = "마지막/빈 페이지이면 null") String nextCursor, boolean hasNext) {

	@Schema(requiredProperties = {"notification", "invitation"})
	public record Item(NotificationData notification,
		@Schema(description = "수신자용 초대 조회가 불가능하거나 미연결이면 null") InvitationTarget invitation) {}
}
