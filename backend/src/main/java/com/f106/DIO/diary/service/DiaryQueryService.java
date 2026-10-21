package com.f106.DIO.diary.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.dto.DiaryListResponse;
import com.f106.DIO.diary.dto.DiaryResponse;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.diary.support.DiaryNotFoundException;

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
