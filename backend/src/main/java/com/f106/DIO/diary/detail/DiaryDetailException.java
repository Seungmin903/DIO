package com.f106.DIO.diary.detail;

import org.springframework.http.HttpStatus;

/** 233 서비스 경계 오류. 기존 공통 컨트롤러/오류 처리기 연결은 234 통합 후 별도로 수행한다. */
public class DiaryDetailException extends RuntimeException {
	private final HttpStatus status;
	private final String code;

	public DiaryDetailException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus status() { return status; }
	public String code() { return code; }

	public static DiaryDetailException unauthorized() {
		return new DiaryDetailException(HttpStatus.UNAUTHORIZED, "DIARY_AUTHENTICATION_REQUIRED", "로그인이 필요합니다.");
	}
	public static DiaryDetailException notFound() {
		return new DiaryDetailException(HttpStatus.NOT_FOUND, "DIARY_NOT_FOUND", "다이어리를 찾을 수 없습니다.");
	}
	public static DiaryDetailException invalid() {
		return new DiaryDetailException(HttpStatus.BAD_REQUEST, "INVALID_DIARY_METADATA", "수정 내용과 기준 시각을 확인해 주세요.");
	}
}
