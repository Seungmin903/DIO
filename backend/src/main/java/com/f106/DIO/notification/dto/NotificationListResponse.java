package com.f106.DIO.notification.dto;

import java.util.List;

import com.f106.DIO.notification.invitation.InvitationLookup.InvitationTarget;

public record NotificationListResponse(List<Item> items, String nextCursor, boolean hasNext) {

	public record Item(NotificationData notification, InvitationTarget invitation) {}
}
