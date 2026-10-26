package com.f106.DIO.diary.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.dto.DiaryCreateResponse;
import com.f106.DIO.diary.repository.DiaryRepository;

@Service
public class DiaryCreationService {

	private final DiaryRepository diaryRepository;
	public DiaryCreationService(DiaryRepository diaryRepository) {
		this.diaryRepository = diaryRepository;
	}

	@Transactional
	public DiaryCreateResponse create(DiaryCreateRequest request) {
		Diary diary = diaryRepository.saveAndFlush(new Diary(request.diaryTitle(), request.coverColor(),
			request.coverStyle(), request.visibility()));
		return new DiaryCreateResponse(DiaryMapper.toData(diary));
	}
}
