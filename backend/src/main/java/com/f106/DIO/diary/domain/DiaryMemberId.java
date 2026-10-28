package com.f106.DIO.diary.domain;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** diary_members 복합 키. */
public class DiaryMemberId implements Serializable {
	private UUID diaryId;
	private Long userId;

	public DiaryMemberId() { }

	public DiaryMemberId(UUID diaryId, Long userId) {
		this.diaryId = diaryId;
		this.userId = userId;
	}

	@Override
	public boolean equals(Object other) {
		if (this == other) return true;
		if (!(other instanceof DiaryMemberId value)) return false;
		return Objects.equals(diaryId, value.diaryId) && Objects.equals(userId, value.userId);
	}

	@Override
	public int hashCode() {
		return Objects.hash(diaryId, userId);
	}
}
