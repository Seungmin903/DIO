package com.ssafy.dio.diary.service;

import org.springframework.stereotype.Service;

import com.ssafy.dio.diary.dto.DiaryCreateRequest;
import com.ssafy.dio.diary.dto.DiaryCreateResponse;

@Service
public class DiaryService {

	private final DiaryCreationService creationService;

	public DiaryService(DiaryCreationService creationService) {
		this.creationService = creationService;
	}

	public DiaryCreateResponse createDiary(DiaryCreateRequest request) {
		return creationService.create(request);
	}
}
