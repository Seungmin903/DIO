package com.f106.DIO.media.support;

import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/** 개인 보관함과 공유 보관함 목록이 함께 쓰는 최신순 커서. 생성 시각과 미디어 ID로 같은 시각의 항목도 순서를 고정한다. */
public record MediaListCursor(Instant createdAt, UUID mediaFileId) {
	public static final int DEFAULT_LIMIT = 30;
	public static final int MAX_LIMIT = 100;

	public static void requireValidLimit(int limit) {
		if (limit < 1 || limit > MAX_LIMIT) throw MediaRequestException.invalidLimit();
	}

	public static String encode(Instant createdAt, UUID mediaFileId) {
		String raw = createdAt + "|" + mediaFileId;
		return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
	}

	public static MediaListCursor decode(String encodedCursor) {
		if (encodedCursor == null || encodedCursor.isBlank()) return null;
		try {
			String raw = new String(Base64.getUrlDecoder().decode(encodedCursor), StandardCharsets.UTF_8);
			String[] parts = raw.split("\\|", -1);
			if (parts.length != 2) throw MediaRequestException.invalidCursor();
			return new MediaListCursor(Instant.parse(parts[0]), UUID.fromString(parts[1]));
		} catch (IllegalArgumentException | DateTimeException error) { throw MediaRequestException.invalidCursor(); }
	}
}
