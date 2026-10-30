package com.f106.DIO.notification.event;

import java.time.Instant;
import java.util.UUID;

/** 공유 모듈이 확정·저장한 초대의 내부 이벤트. 재전달에는 같은 eventId와 내용을 사용한다. */
public record InvitationConfirmedEvent(UUID eventId, long inviteId, long recipientUserId, Instant occurredAt) {}
