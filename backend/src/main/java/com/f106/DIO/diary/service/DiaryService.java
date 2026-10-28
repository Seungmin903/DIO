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

	public DiaryCreateResponse createDiary(DiaryCreateRequest request) {
		return creationService.create(request);
	}

	public DiaryListResponse getDiaries() {
		return queryService.list();
	}

	public DiaryResponse getDiary(UUID diaryId) {
		return queryService.detail(diaryId);
	}

	public DiaryResponse updateDiary(UUID diaryId, DiaryUpdateRequest request) {
		return modificationService.update(diaryId, request);
	}

	public void deleteDiary(UUID diaryId) {
		modificationService.delete(diaryId);
	}
}
