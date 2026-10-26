package com.f106.DIO.diary.dto;

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
	@Schema(example = "PLAIN", description = "표지 스타일. 생략하면 PLAIN")
	@Size(max = 30) @Pattern(regexp = "(?s).*\\S.*") String coverStyle,
	@Schema(example = "PRIVATE", allowableValues = {"PRIVATE", "MEMBERS", "LINK"})
	@Pattern(regexp = "PRIVATE|MEMBERS|LINK") String visibility
) {
	public DiaryCreateRequest {
		diaryTitle = diaryTitle == null ? null : diaryTitle.strip();
		coverColor = coverColor == null ? "#CED9EE" : coverColor;
		coverStyle = coverStyle == null ? "PLAIN" : coverStyle;
		visibility = visibility == null ? "PRIVATE" : visibility;
	}
}
