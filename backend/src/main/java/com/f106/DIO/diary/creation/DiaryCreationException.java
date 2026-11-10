package com.f106.DIO.diary.creation;

import org.springframework.http.HttpStatus;

public class DiaryCreationException extends RuntimeException {
	private final HttpStatus status;
	private final String code;
	public DiaryCreationException(HttpStatus status, String code, String message) {
		super(message); this.status = status; this.code = code;
	}
	public HttpStatus status() { return status; }
	public String code() { return code; }
	public static DiaryCreationException unauthorized() {
		return new DiaryCreationException(HttpStatus.UNAUTHORIZED,"DIARY_CREATION_AUTHENTICATION_REQUIRED","로그인이 필요해요.");
	}
	public static DiaryCreationException invalid() {
		return new DiaryCreationException(HttpStatus.BAD_REQUEST,"INVALID_DIARY_CREATION","다이어리와 초기 페이지 구성을 확인해 주세요.");
	}
	public static DiaryCreationException invalidState() {
		return new DiaryCreationException(HttpStatus.INTERNAL_SERVER_ERROR,"DIARY_CREATION_STATE_INVALID","생성 결과를 확인하지 못했어요.");
	}
	public static DiaryCreationException pagesNotConnected() {
		return new DiaryCreationException(HttpStatus.SERVICE_UNAVAILABLE,"DIARY_INITIAL_PAGES_NOT_CONNECTED","초기 페이지 생성 연결이 준비되지 않았어요.");
	}
}
