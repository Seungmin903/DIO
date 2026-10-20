package com.ssafy.dio.diary.dto;

import java.math.BigDecimal;
import java.time.Instant;

import io.swagger.v3.oas.annotations.media.Schema;

/** 생성 API 전용 응답. ID는 명세에 따라 JSON 문자열로 제공한다. */
public record DiaryCreateResponse(DiaryData diary) {

	public record DiaryData(
		@Schema(example = "1")
		String diaryId,
		@Schema(example = "여행 다이어리")
		String diaryTitle,
		@Schema(example = "#D6BFA7")
		String coverColor,
		@Schema(example = "LINEN")
		String coverPattern,
		@Schema(example = "RING")
		String bindingType,
		@Schema(example = "1")
		String formatId,
		@Schema(example = "1280")
		BigDecimal canvasWidth,
		@Schema(example = "800")
		BigDecimal canvasHeight,
		@Schema(example = "BLANK")
		String defaultPageTemplate,
		@Schema(example = "2026-10-20T04:00:00Z")
		Instant createdAt,
		@Schema(example = "2026-10-20T04:00:00Z")
		Instant updatedAt
	) {
	}
}
