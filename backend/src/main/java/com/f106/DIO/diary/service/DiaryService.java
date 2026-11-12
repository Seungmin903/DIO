package com.f106.DIO.diary.service;

import java.util.UUID;

import org.springframework.stereotype.Service;

import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.dto.DiaryCreateResponse;
import com.f106.DIO.diary.dto.DiaryListResponse;
import com.f106.DIO.diary.dto.DiaryResponse;
import com.f106.DIO.diary.dto.DiaryUpdateRequest;

@Service
public class DiaryService {

	private final DiaryCreationService creationService;
	private final DiaryQueryService queryService;
	private final DiaryModificationService modificationService;

	public DiaryService(DiaryCreationService creationService,
		DiaryQueryService queryService,
		DiaryModificationService modificationService) {
		this.creationService = creationService;
		this.queryService = queryService;
		this.modificationService = modificationService;
	}

	public DiaryCreateResponse createDiary(DiaryCreateRequest request, Long ownerUserId) {
		return creationService.create(request, ownerUserId);
	}

	public DiaryListResponse getDiaries(Long userId) {
		return queryService.list(userId);
	}

	public DiaryResponse getDiary(UUID diaryId, Long userId) {
		return queryService.detail(diaryId, userId);
	}

	public DiaryResponse updateDiary(UUID diaryId, DiaryUpdateRequest request, Long userId) {
		return modificationService.update(diaryId, request, userId);
	}

	public void deleteDiary(UUID diaryId, Long userId) {
		modificationService.delete(diaryId, userId);
	}
}
