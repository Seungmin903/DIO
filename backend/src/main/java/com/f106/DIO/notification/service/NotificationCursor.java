package com.f106.DIO.notification.service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

import com.f106.DIO.notification.dto.NotificationData;
import com.f106.DIO.notification.support.NotificationException;

/** 정렬 키는 생성 시각 + 숫자 ID. 커서는 인증 수단이 아니며 DB 조회에도 수신자 조건을 건다. */
public record NotificationCursor(Instant createdAt, long notificationId) {

	public static NotificationCursor decode(String encoded, long userId) {
		if (encoded == null) return null;
		try {
			if (encoded.isEmpty() || encoded.length() > 256 || !encoded.matches("[A-Za-z0-9_-]+")) {
				throw new IllegalArgumentException();
			}
			String[] parts = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8).split("\\|", -1);
			if (parts.length != 4 || !parts[0].equals("1") || Long.parseLong(parts[1]) != userId) {
				throw new IllegalArgumentException();
			}
			Instant at = Instant.parse(parts[2]);
			long id = Long.parseLong(parts[3]);
			if (id <= 0 || !at.equals(at.truncatedTo(ChronoUnit.MICROS))
				|| at.isBefore(Instant.parse("0001-01-01T00:00:00Z")) || at.isAfter(Instant.parse("9999-12-31T23:59:59Z"))) {
				throw new IllegalArgumentException();
			}
			return new NotificationCursor(at, id);
		} catch (RuntimeException invalid) {
			throw NotificationException.invalidCursor();
		}
	}

	public static String encode(long userId, NotificationData data) {
		String value = "1|" + userId + "|" + data.createdAt() + "|" + data.notificationId();
		return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
	}
}
