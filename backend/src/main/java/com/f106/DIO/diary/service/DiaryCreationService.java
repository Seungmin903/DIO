package com.f106.DIO.diary.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.dto.DiaryCreateResponse;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.diary.repository.DiaryRepository;

@Service
public class DiaryCreationService {
    @org.springframework.beans.factory.annotation.Autowired private com.f106.DIO.inventory.InventoryLimits inventory;

	private final DiaryRepository diaryRepository;
	private final DiaryMemberRepository memberRepository;
	public DiaryCreationService(DiaryRepository diaryRepository, DiaryMemberRepository memberRepository) {
		this.diaryRepository = diaryRepository;
		this.memberRepository = memberRepository;
	}

	@Transactional
	public DiaryCreateResponse create(DiaryCreateRequest request, Long ownerUserId) {
		// 소유자 없는 다이어리는 누구도 접근할 수 없으므로 만들지 않는다.
		java.util.Objects.requireNonNull(ownerUserId, "ownerUserId");
		Diary diary = diaryRepository.saveAndFlush(new Diary(request.diaryTitle(), request.coverColor(),
			request.coverStyle(), request.visibility(), ownerUserId));
		memberRepository.saveAndFlush(new DiaryMember(diary.getDiaryId(), ownerUserId, "OWNER"));
		inventory.createdDiary(ownerUserId,diary.isInventoryShared());
		return new DiaryCreateResponse(DiaryMapper.toData(diary));
	}
}
