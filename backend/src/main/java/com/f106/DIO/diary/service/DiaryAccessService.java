package com.f106.DIO.diary.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.diary.support.DiaryAccessDeniedException;
import com.f106.DIO.diary.support.DiaryNotFoundException;

/** 로그인한 사용자가 다이어리의 읽기·쓰기 권한을 갖는지 확인한다. */
@Service
public class DiaryAccessService {
	private final DiaryRepository diaries;
	private final DiaryMemberRepository members;

	public DiaryAccessService(DiaryRepository diaries, DiaryMemberRepository members) {
		this.diaries = diaries;
		this.members = members;
	}

	@Transactional(readOnly = true)
	public Diary requireRead(UUID diaryId, Long userId) {
		Diary diary = diaries.findByDiaryIdAndDeletedAtIsNull(diaryId).orElseThrow(DiaryNotFoundException::new);
		member(diary, userId);
		return diary;
	}

	@Transactional(readOnly = true)
	public Diary requireWrite(UUID diaryId, Long userId) {
		Diary diary = diaries.findByDiaryIdAndDeletedAtIsNull(diaryId).orElseThrow(DiaryNotFoundException::new);
		if (isOwner(diary, userId)) return diary;
		if (!member(diary, userId).canWrite()) throw new DiaryAccessDeniedException();
		return diary;
	}

	private DiaryMember member(Diary diary, Long userId) {
		if (isOwner(diary, userId)) return new DiaryMember(diary.getDiaryId(), userId, "OWNER");
		return members.findByDiaryIdAndUserIdAndLeftAtIsNull(diary.getDiaryId(), userId)
			.orElseThrow(DiaryAccessDeniedException::new);
	}

	private static boolean isOwner(Diary diary, Long userId) {
		return diary.getOwnerUserId() != null && diary.getOwnerUserId().equals(userId);
	}
}
