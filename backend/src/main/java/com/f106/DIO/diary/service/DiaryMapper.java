package com.f106.DIO.diary.service;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.dto.DiaryCreateResponse.DiaryData;

final class DiaryMapper {

	private DiaryMapper() {
	}

	static DiaryData toData(Diary diary) {
		return new DiaryData(diary.getDiaryId().toString(), diary.getTitle(), diary.getCoverColor(),
			diary.getCoverStyle(), diary.getVisibility(), diary.getCreatedAt(), diary.getUpdatedAt());
	}
}
