package com.f106.DIO.notification.support;

import org.springframework.http.HttpStatus;

public class NotificationException extends RuntimeException {

	private final HttpStatus status;
	private final String code;

	public NotificationException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus status() { return status; }
	public String code() { return code; }

	public static NotificationException invalidCursor() {
		return new NotificationException(HttpStatus.BAD_REQUEST, "INVALID_NOTIFICATION_CURSOR", "알림 목록을 새로 불러와 주세요.");
	}

	public static NotificationException notFound() {
		return new NotificationException(HttpStatus.NOT_FOUND, "NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없습니다.");
	}
}
