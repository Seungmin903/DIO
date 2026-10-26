package com.f106.DIO.diary.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.dto.DiaryResponse;
import com.f106.DIO.diary.dto.DiaryUpdateRequest;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.diary.support.DiaryNotFoundException;

@Service
public class DiaryModificationService {

	private final DiaryRepository diaryRepository;

	public DiaryModificationService(DiaryRepository diaryRepository) {
		this.diaryRepository = diaryRepository;
	}

	@Transactional
	public DiaryResponse update(UUID diaryId, DiaryUpdateRequest request) {
		Diary diary = diaryRepository.findByDiaryIdAndDeletedAtIsNull(diaryId)
			.orElseThrow(DiaryNotFoundException::new);
		diary.updateSettings(request.getDiaryTitle(), request.getCoverColor(), request.getCoverStyle(), request.getVisibility());
		diaryRepository.flush();
		return new DiaryResponse(DiaryMapper.toData(diary));
	}

	@Transactional
	public void delete(UUID diaryId) {
		Diary diary = diaryRepository.findByDiaryIdAndDeletedAtIsNull(diaryId)
			.orElseThrow(DiaryNotFoundException::new);
		diary.softDelete();
		diaryRepository.flush();
	}
}
