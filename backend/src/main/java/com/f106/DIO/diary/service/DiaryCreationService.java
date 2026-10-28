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

	private final DiaryRepository diaryRepository;
	private final DiaryMemberRepository memberRepository;
	public DiaryCreationService(DiaryRepository diaryRepository, DiaryMemberRepository memberRepository) {
		this.diaryRepository = diaryRepository;
		this.memberRepository = memberRepository;
	}

	@Transactional
	public DiaryCreateResponse create(DiaryCreateRequest request) {
		return create(request, null);
	}

	@Transactional
	public DiaryCreateResponse create(DiaryCreateRequest request, Long ownerUserId) {
		Diary diary = diaryRepository.saveAndFlush(new Diary(request.diaryTitle(), request.coverColor(),
			request.coverStyle(), request.visibility(), ownerUserId));
		if (ownerUserId != null) memberRepository.saveAndFlush(new DiaryMember(diary.getDiaryId(), ownerUserId, "OWNER"));
		return new DiaryCreateResponse(DiaryMapper.toData(diary));
	}
}
