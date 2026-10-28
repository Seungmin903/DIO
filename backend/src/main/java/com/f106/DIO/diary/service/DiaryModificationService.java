package com.f106.DIO.diary.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.dto.DiaryResponse;
import com.f106.DIO.diary.dto.DiaryUpdateRequest;
import com.f106.DIO.diary.repository.DiaryRepository;

@Service
public class DiaryModificationService {

	private final DiaryRepository diaryRepository;
	private final DiaryAccessService accessService;

	public DiaryModificationService(DiaryRepository diaryRepository, DiaryAccessService accessService) {
		this.diaryRepository = diaryRepository;
		this.accessService = accessService;
	}

	@Transactional
	public DiaryResponse update(UUID diaryId, DiaryUpdateRequest request, Long userId) {
		Diary diary = accessService.requireWrite(diaryId, userId);
		diary.updateSettings(request.getDiaryTitle(), request.getCoverColor(), request.getCoverStyle(), request.getVisibility());
		diaryRepository.flush();
		return new DiaryResponse(DiaryMapper.toData(diary));
	}

	@Transactional
	public void delete(UUID diaryId, Long userId) {
		Diary diary = accessService.requireOwner(diaryId, userId);
		diary.softDelete();
		diaryRepository.flush();
	}
}
