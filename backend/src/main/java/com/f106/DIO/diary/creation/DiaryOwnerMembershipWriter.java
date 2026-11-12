package com.f106.DIO.diary.creation;

import java.time.Instant;
import java.util.UUID;

/** 공유 담당 멤버십 생성과 통합할 경계. 반드시 호출 트랜잭션의 같은 DB에 참여한다. */
public interface DiaryOwnerMembershipWriter {
	void create(UUID diaryId, long verifiedOwnerId, String serverMemberColor, Instant createdAt);
}
