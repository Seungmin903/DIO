package com.f106.DIO.media.storage;

import org.springframework.http.HttpStatus;

public class MediaStorageException extends RuntimeException {
	private final HttpStatus status;
	private final String code;
	private MediaStorageException(HttpStatus status, String code, String message) {
		super(message); this.status = status; this.code = code;
	}
	public static MediaStorageException unavailable() {
		return new MediaStorageException(HttpStatus.SERVICE_UNAVAILABLE, "MEDIA_STORAGE_UNAVAILABLE",
			"미디어 저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
	}
	public static MediaStorageException missing() {
		return new MediaStorageException(HttpStatus.NOT_FOUND, "MEDIA_FILE_CONTENT_NOT_FOUND", "미디어 파일을 찾을 수 없어요.");
	}
	public HttpStatus status() { return status; }
	public String code() { return code; }
}
