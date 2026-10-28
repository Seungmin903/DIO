package com.f106.DIO.diary.service;

import java.util.UUID;
import java.util.LinkedHashSet;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.dto.DiaryListResponse;
import com.f106.DIO.diary.dto.DiaryResponse;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.diary.repository.DiaryMemberRepository;

@Service
public class DiaryQueryService {

	private final DiaryRepository diaryRepository;
	private final DiaryMemberRepository memberRepository;
	private final DiaryAccessService accessService;

	public DiaryQueryService(DiaryRepository diaryRepository, DiaryMemberRepository memberRepository, DiaryAccessService accessService) {
		this.diaryRepository = diaryRepository;
		this.memberRepository = memberRepository;
		this.accessService = accessService;
	}

	@Transactional(readOnly = true)
	public DiaryListResponse list(Long userId) {
		var diaryIds = new LinkedHashSet<UUID>();
		diaryIds.addAll(diaryRepository.findAllByOwnerUserIdAndDeletedAtIsNullOrderByCreatedAtDescDiaryIdDesc(userId)
			.stream().map(Diary::getDiaryId).toList());
		diaryIds.addAll(memberRepository.findAllByUserIdAndLeftAtIsNull(userId).stream().map(member -> member.getDiaryId()).toList());
		if (diaryIds.isEmpty()) return new DiaryListResponse(java.util.List.of());
		return new DiaryListResponse(diaryRepository.findAllByDiaryIdInAndDeletedAtIsNullOrderByCreatedAtDescDiaryIdDesc(diaryIds)
			.stream().map(DiaryMapper::toData).toList());
	}

	@Transactional(readOnly = true)
	public DiaryResponse detail(UUID diaryId, Long userId) {
		return new DiaryResponse(DiaryMapper.toData(accessService.requireRead(diaryId, userId)));
	}
}
