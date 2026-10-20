package com.ssafy.dio.diary.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.dio.diary.dto.DiaryListResponse;
import com.ssafy.dio.diary.repository.DiaryRepository;

@Service
public class DiaryQueryService {

	private final DiaryRepository diaryRepository;

	public DiaryQueryService(DiaryRepository diaryRepository) {
		this.diaryRepository = diaryRepository;
	}

	@Transactional(readOnly = true)
	public DiaryListResponse list() {
		return new DiaryListResponse(diaryRepository.findAllByOrderByCreatedAtDescDiaryIdDesc()
			.stream().map(DiaryMapper::toData).toList());
	}

}
