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
	public static MediaRequestException invalidCursor() {
		return new MediaRequestException(HttpStatus.BAD_REQUEST, "INVALID_MEDIA_CURSOR", "미디어 목록 커서가 올바르지 않습니다.");
	}
	public static MediaRequestException invalidLimit() {
		return new MediaRequestException(HttpStatus.BAD_REQUEST, "INVALID_MEDIA_LIMIT", "미디어 목록 limit은 1에서 100 사이여야 합니다.");
	}
	public static MediaRequestException sharedLibraryReference() {
		return new MediaRequestException(HttpStatus.CONFLICT, "MEDIA_FILE_SHARED", "공유 보관함에서 제거한 뒤 미디어를 삭제할 수 있습니다.");
	}
	public static MediaRequestException canvasReference() { return new MediaRequestException(HttpStatus.CONFLICT,"MEDIA_FILE_IN_CANVAS","캔버스에서 사용 중인 이미지 원본은 삭제할 수 없습니다."); }
	public HttpStatus status() { return status; }
	public String code() { return code; }
}
