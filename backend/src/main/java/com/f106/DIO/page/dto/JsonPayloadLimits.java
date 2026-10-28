package com.f106.DIO.page.dto;

import java.nio.charset.StandardCharsets;
import tools.jackson.databind.JsonNode;

/** JSONB 열 하나가 과도하게 커지는 것을 막는 API 입력 한도. */
final class JsonPayloadLimits {
	static final int MAX_TEMPLATE_CONFIG_BYTES = 512 * 1024;
	static final int MAX_ELEMENT_PROPERTIES_BYTES = 128 * 1024;

	private JsonPayloadLimits() {}

	static boolean fits(JsonNode value, int maxBytes) {
		return bytes(value) <= maxBytes;
	}

	static int bytes(JsonNode value) {
		return value == null ? 0 : value.toString().getBytes(StandardCharsets.UTF_8).length;
	}
}
