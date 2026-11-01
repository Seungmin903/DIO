package com.f106.DIO.media.library.support;

import org.springframework.http.HttpStatus;

public class SharedMediaLibraryException extends RuntimeException {
	private final HttpStatus status;
	private final String code;
	private SharedMediaLibraryException(HttpStatus status, String code, String message) {
		super(message); this.status = status; this.code = code;
	}
	public static SharedMediaLibraryException duplicate() {
		return new SharedMediaLibraryException(HttpStatus.CONFLICT, "MEDIA_LIBRARY_ALREADY_CONTAINS_MEDIA", "이미 공유 보관함에 추가된 미디어입니다.");
	}
	public static SharedMediaLibraryException unsupportedCategory() {
		return new SharedMediaLibraryException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_SHARED_MEDIA_CATEGORY", "공유 보관함에는 스티커·테이프·편집 원본만 추가할 수 있습니다.");
	}
	public static SharedMediaLibraryException notFound() {
		return new SharedMediaLibraryException(HttpStatus.NOT_FOUND, "MEDIA_LIBRARY_ENTRY_NOT_FOUND", "공유 보관함에서 미디어를 찾을 수 없습니다.");
	}
	public HttpStatus status() { return status; }
	public String code() { return code; }
}
