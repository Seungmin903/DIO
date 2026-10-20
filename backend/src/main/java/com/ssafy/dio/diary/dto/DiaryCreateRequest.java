package com.ssafy.dio.diary.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 비회원 다이어리 생성 요청. 제목은 공백 제거 후 검증한다. */
public record DiaryCreateRequest(
	@Schema(example = "여행 다이어리", description = "앞뒤 공백 제거 후 1~100자")
	@NotBlank @Size(max = 100) String diaryTitle,
	@Schema(example = "#D6BFA7")
	@NotBlank @Pattern(regexp = "#[0-9a-fA-F]{6}") String coverColor,
	@Schema(example = "LINEN", allowableValues = {"LINEN", "LEATHER", "DOT", "GINGHAM", "STRIPE"})
	@NotBlank @Pattern(regexp = "LINEN|LEATHER|DOT|GINGHAM|STRIPE") String coverPattern,
	@Schema(example = "RING", description = "제본 허용 목록 확정 필요")
	@NotBlank @Size(max = 30) String bindingType,
	@Schema(example = "1", description = "서버 규격 ID. 현재 1 = 가로 1280×800")
	@NotBlank String formatId,
	@Schema(example = "BLANK", allowableValues = {"MONTHLY", "WEEKLY", "BLANK", "LINED", "SQUARED", "DOTTED"})
	@NotBlank @Pattern(regexp = "MONTHLY|WEEKLY|BLANK|LINED|SQUARED|DOTTED") String defaultPageTemplate
) {
	public DiaryCreateRequest {
		diaryTitle = diaryTitle == null ? null : diaryTitle.strip();
	}
}
