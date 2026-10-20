package com.ssafy.dio.diary.service;

import com.ssafy.dio.diary.domain.Diary;
import com.ssafy.dio.diary.dto.DiaryCreateResponse.DiaryData;

final class DiaryMapper {

	private DiaryMapper() {
	}

	static DiaryData toData(Diary diary) {
		return new DiaryData(diary.getDiaryId().toString(), diary.getTitle(), diary.getCoverColor(),
			diary.getCoverStyle(), diary.getCoverBinding(), diary.getFormatId(), diary.getCanvasWidth(), diary.getCanvasHeight(),
			diary.getDefaultPageTemplate(), diary.getCreatedAt(), diary.getUpdatedAt());
	}
}
