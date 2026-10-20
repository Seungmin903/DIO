package com.ssafy.dio.diary.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.dio.diary.domain.Diary;
import com.ssafy.dio.diary.dto.DiaryResponse;
import com.ssafy.dio.diary.dto.DiaryUpdateRequest;
import com.ssafy.dio.diary.repository.DiaryRepository;
import com.ssafy.dio.diary.support.DiaryNotFoundException;

@Service
public class DiaryModificationService {

	private final DiaryRepository diaryRepository;

	public DiaryModificationService(DiaryRepository diaryRepository) {
		this.diaryRepository = diaryRepository;
	}

	@Transactional
	public DiaryResponse update(Long diaryId, DiaryUpdateRequest request) {
		Diary diary = diaryRepository.findById(diaryId).orElseThrow(DiaryNotFoundException::new);
		diary.updateSettings(request.getDiaryTitle(), request.getCoverColor(), request.getCoverPattern(), request.getBindingType());
		diaryRepository.flush();
		return new DiaryResponse(DiaryMapper.toData(diary));
	}

	@Transactional
	public void delete(Long diaryId) {
		Diary diary = diaryRepository.findById(diaryId).orElseThrow(DiaryNotFoundException::new);
		diaryRepository.delete(diary);
		diaryRepository.flush();
	}
}
