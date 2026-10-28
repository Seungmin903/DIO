package com.f106.DIO.page.dto;

import java.nio.charset.StandardCharsets;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Swagger의 form 입력에서 JSON 속성 한 칸을 안전하게 읽는다. */
final class FormJson {
	private static final JsonMapper JSON = JsonMapper.builder().build();

	private FormJson() { }

	static JsonNode parse(String value, int maxBytes, String field) {
		if (value == null || value.isBlank()) return null;
		if (value.getBytes(StandardCharsets.UTF_8).length > maxBytes) {
			throw new IllegalArgumentException(field + "의 크기가 허용 범위를 초과했습니다.");
		}
		try {
			JsonNode parsed = JSON.readTree(value);
			if (parsed == null) throw new IllegalArgumentException(field + "은 유효한 JSON이어야 합니다.");
			return parsed;
		} catch (IllegalArgumentException exception) {
			throw exception;
		} catch (Exception exception) {
			throw new IllegalArgumentException(field + "은 유효한 JSON이어야 합니다.", exception);
		}
	}
}
