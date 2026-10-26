package com.f106.DIO.notification.invitation;

import java.util.Optional;
import java.util.UUID;

/** 공유 담당이 수신자 권한과 현재 초대 상태를 확인한 결과만 반환한다. */
public interface InvitationLookup {

	Optional<InvitationTarget> findForRecipient(long recipientUserId, long notificationId);

	/** 이동 가능 여부는 공유 모듈의 판단을 따른다. 링크 토큰은 반환하지 않는다. */
	record InvitationTarget(String inviteId, String status, UUID diaryId, boolean canOpen) {}
}
