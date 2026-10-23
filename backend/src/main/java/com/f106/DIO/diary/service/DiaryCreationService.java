package com.f106.DIO.diary.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.config.DiaryFormatProperties;
import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.dto.DiaryCreateResponse;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.diary.support.InvalidDiaryFormatException;

@Service
public class DiaryCreationService {

	private final DiaryRepository diaryRepository;
	private final DiaryFormatProperties formats;

	public DiaryCreationService(DiaryRepository diaryRepository, DiaryFormatProperties formats) {
		this.diaryRepository = diaryRepository;
		this.formats = formats;
	}

	@Transactional
	public DiaryCreateResponse create(DiaryCreateRequest request) {
		DiaryFormatProperties.Dimensions dimensions = formats.getFormats().get(request.formatId());
		if (dimensions == null) {
			throw new InvalidDiaryFormatException();
		}
		Diary diary = diaryRepository.saveAndFlush(new Diary(request.diaryTitle(), request.coverColor(),
			request.coverPattern(), request.bindingType(), request.formatId(), dimensions.width(), dimensions.height(),
			request.defaultPageTemplate()));
		return new DiaryCreateResponse(DiaryMapper.toData(diary));
	}
}
