package com.f106.DIO.notification.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.notification.dto.NotificationData;
import com.f106.DIO.notification.dto.NotificationListResponse;
import com.f106.DIO.notification.invitation.InvitationLookup;
import com.f106.DIO.notification.repository.NotificationRepository;
import com.f106.DIO.notification.support.NotificationException;

@Service
@Transactional(readOnly = true)
public class NotificationService {

	private final NotificationRepository repository;
	private final ObjectProvider<InvitationLookup> invitations;

	public NotificationService(NotificationRepository repository, ObjectProvider<InvitationLookup> invitations) {
		this.repository = repository;
		this.invitations = invitations;
	}

	public NotificationListResponse list(long userId, String encodedCursor, int limit) {
		if (limit < 1 || limit > 100) {
			throw new NotificationException(HttpStatus.BAD_REQUEST, "INVALID_NOTIFICATION_LIMIT", "한 번에 1~100개를 조회할 수 있습니다.");
		}
		NotificationCursor cursor = NotificationCursor.decode(encodedCursor, userId);
		List<NotificationData> rows = repository.list(userId, cursor, limit + 1);
		boolean hasNext = rows.size() > limit;
		List<NotificationData> page = rows.stream().limit(limit).toList();
		InvitationLookup lookup = invitations.getIfAvailable();
		Map<Long, InvitationLookup.InvitationTarget> targets = lookup == null || page.isEmpty() ? Map.of()
			: lookup.findForRecipient(userId, page.stream().map(row -> Long.parseLong(row.notificationId())).toList());
		List<NotificationListResponse.Item> items = page.stream().map(row -> new NotificationListResponse.Item(row,
			targets.get(Long.parseLong(row.notificationId())))).toList();
		return new NotificationListResponse(items, hasNext ? NotificationCursor.encode(userId, page.get(page.size() - 1)) : null, hasNext);
	}

	/** 전체 미읽음 개수이며, 유효 초대만 세는 UI 빨간 점 계약과는 별개다. */
	public long unreadCount(long userId) { return repository.unreadCount(userId); }

	@Transactional
	public NotificationData markRead(long userId, long id) {
		repository.markRead(userId, id, Instant.now().truncatedTo(ChronoUnit.MICROS));
		return repository.find(userId, id).orElseThrow(NotificationException::notFound);
	}
}
