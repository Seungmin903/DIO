package com.f106.DIO.cutout.dto;

import java.time.Instant;
import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

public record CutoutCreatedResponse(
		@Schema(description = "이후 붓질·결과·저장 요청에 쓰는 ID") UUID cutoutId,
		@Schema(description = "EXIF 회전을 적용하고 줄인 사진 가로 픽셀") int width,
		@Schema(description = "EXIF 회전을 적용하고 줄인 사진 세로 픽셀") int height,
		@Schema(description = "마지막 사용 후 이 시각이 지나면 사진을 다시 올려야 한다") Instant expiresAt) {}
