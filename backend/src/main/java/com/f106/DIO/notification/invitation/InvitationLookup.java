package com.f106.DIO.notification.invitation;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

/** 공유 담당이 수신자 권한과 현재 초대 상태를 확인한 결과만 반환한다. */
public interface InvitationLookup {

	/** 반환 페이지의 ID를 한 번에 조회한다. 수신자에게 없는/접근 불가한 ID는 결과에서 제외한다.
	 * 구현은 항목별 쿼리 대신 일괄 조회를 사용하고 빈 입력에는 빈 Map을 반환한다. */
	Map<Long, InvitationTarget> findForRecipient(long recipientUserId, Collection<Long> notificationIds);

	/** 읽지 않았고 지금 열 수 있는 초대 알림 수. */
	long countActionableUnread(long recipientUserId);

	/** 이동 가능 여부는 공유 모듈의 판단을 따른다. 링크 토큰은 반환하지 않는다. */
	@Schema(requiredProperties = {"inviteId", "status", "diaryId", "canOpen"})
	record InvitationTarget(String inviteId, String status, UUID diaryId, boolean canOpen) {}
}
