package com.f106.DIO.media.support;

import org.springframework.http.HttpStatus;

public class MediaRequestException extends RuntimeException {
	private final HttpStatus status;
	private final String code;
	private MediaRequestException(HttpStatus status, String code, String message) {
		super(message); this.status = status; this.code = code;
	}
	public static MediaRequestException invalidFile() {
		return new MediaRequestException(HttpStatus.BAD_REQUEST, "INVALID_MEDIA_FILE", "지원하지 않거나 손상된 미디어 파일입니다.");
	}
	public static MediaRequestException tooLarge() {
		return new MediaRequestException(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_FILE_TOO_LARGE", "미디어 파일은 5MB 이하로 올려 주세요.");
	}
	public static MediaRequestException invalidCategory() {
		return new MediaRequestException(HttpStatus.BAD_REQUEST, "INVALID_MEDIA_CATEGORY", "파일 종류에 맞는 미디어 분류가 아닙니다.");
	}
	public HttpStatus status() { return status; }
	public String code() { return code; }
}
