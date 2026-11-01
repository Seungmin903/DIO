package com.f106.DIO.cutout.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record CutoutPreviewResponse(
		@Schema(description = "원본 위에 늘려 겹칠 선택 영역 PNG (data URL, 긴 변 768px 이하)") String preview,
		@Schema(description = "AI 처리 시간 (ms)") long segmentMs) {}
