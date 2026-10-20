package com.ssafy.dio.diary.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.dio.diary.dto.DiaryListResponse;
import com.ssafy.dio.diary.dto.DiaryResponse;
import com.ssafy.dio.diary.repository.DiaryRepository;
import com.ssafy.dio.diary.support.DiaryNotFoundException;

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

	@Transactional(readOnly = true)
	public DiaryResponse detail(Long diaryId) {
		return new DiaryResponse(DiaryMapper.toData(diaryRepository.findById(diaryId)
			.orElseThrow(DiaryNotFoundException::new)));
	}
}
