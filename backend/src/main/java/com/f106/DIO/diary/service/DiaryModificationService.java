package com.f106.DIO.diary.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.dto.DiaryResponse;
import com.f106.DIO.diary.dto.DiaryUpdateRequest;
import com.f106.DIO.diary.repository.DiaryRepository;

@Service
public class DiaryModificationService {
    @org.springframework.beans.factory.annotation.Autowired private com.f106.DIO.inventory.InventoryLimits inventory;

	private final DiaryRepository diaryRepository;
	private final DiaryAccessService accessService;
	private final MemberDiaryWriteBoundary memberBoundary;

	public DiaryModificationService(DiaryRepository diaryRepository, DiaryAccessService accessService, MemberDiaryWriteBoundary memberBoundary) {
		this.diaryRepository = diaryRepository;
		this.accessService = accessService;
		this.memberBoundary = memberBoundary;
	}

	@Transactional
	public DiaryResponse update(UUID diaryId, DiaryUpdateRequest request, Long userId) {
		memberBoundary.requireLegacyWrite(diaryId);
		Diary diary = accessService.requireWrite(diaryId, userId);
		boolean shared=inventory.shared(diaryId);
		diary.updateSettings(request.getDiaryTitle(), request.getCoverColor(), request.getCoverStyle(), request.getVisibility());
		diaryRepository.flush();
		if(!shared && diary.isInventoryShared()) inventory.sharedDiaryChanged(diaryId,false,null);
		return new DiaryResponse(DiaryMapper.toData(diary));
	}

	@Transactional
	public void delete(UUID diaryId, Long userId) {
		memberBoundary.requireLegacyWrite(diaryId);
		Diary diary = accessService.requireOwner(diaryId, userId);
		diary.softDelete();
		diaryRepository.flush();
	}
}
