package com.ssafy.dio.diary.dto;

/** 상세 조회 응답. 내부 정보는 생성 응답의 diary와 동일한 형식이다. */
public record DiaryResponse(DiaryCreateResponse.DiaryData diary) {
}
