package com.f106.DIO.diary.dto;

import java.util.List;

/** 목록의 각 항목은 생성 응답의 diary와 동일한 형식을 사용한다. */
public record DiaryListResponse(List<DiaryCreateResponse.DiaryData> items) {
}
