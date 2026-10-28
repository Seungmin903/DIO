package com.f106.DIO.diary.detail;

import java.util.UUID;

/** 호출 트랜잭션이 끝날 때까지 활성 멤버십의 변경을 직렬화하는 공유 담당 연결 지점. */
public interface DiaryMembershipAccess {
	Role requireActiveRole(long userId, UUID diaryId, Long ownerUserId);
	enum Role { OWNER, EDITOR, VIEWER }
}
