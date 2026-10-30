package com.f106.DIO.notification.event;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * 공유 담당 연결 포트. 사용자 입력이 아닌 현재 권한·상태를 검증한 초대만 반환한다.
 * 실제 어댑터는 호출 트랜잭션에서 초대 취소·만료 처리와 상태 확인을 직렬화해야 한다.
 * 외부에서 이미 읽어 둔 DTO만 반환해서는 상태 변경 경합까지 보장할 수 없다.
 */
public interface InvitationNotificationSource {

	Optional<Snapshot> findForNotification(long inviteId, long recipientUserId);

	/** 빈 응답/통신 오류는 아직 처리 가능 여부를 확인하지 못한 상태이며 재시도 대상으로 취급한다. */
	record Snapshot(long inviteId, long recipientUserId, long inviterUserId, UUID diaryId,
		Kind kind, Eligibility eligibility, Instant expiresAt) {}

	enum Kind { DIRECT, LINK }
	enum Eligibility { NOTIFIABLE, REVOKED, EXPIRED, INELIGIBLE }
}
