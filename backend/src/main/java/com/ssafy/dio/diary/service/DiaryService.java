package com.ssafy.dio.diary.service;

import org.springframework.stereotype.Service;

import com.ssafy.dio.diary.dto.DiaryCreateRequest;
import com.ssafy.dio.diary.dto.DiaryCreateResponse;
import com.ssafy.dio.diary.dto.DiaryListResponse;

@Service
public class DiaryService {

	private final DiaryCreationService creationService;
	private final DiaryQueryService queryService;

	public DiaryService(DiaryCreationService creationService, DiaryQueryService queryService) {
		this.creationService = creationService;
		this.queryService = queryService;
	}

	public DiaryCreateResponse createDiary(DiaryCreateRequest request) {
		return creationService.create(request);
	}

	public DiaryListResponse getDiaries() {
		return queryService.list();
	}
}
