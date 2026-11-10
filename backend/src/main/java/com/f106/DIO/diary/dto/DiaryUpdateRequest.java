package com.f106.DIO.diary.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 생략은 유지, 명시적 null은 역직렬화 단계에서 거절하는 부분 수정 요청. */
@Schema(description = "수정할 필드를 하나 이상 전달. 생략은 유지, 명시적 null은 불가.",
	example = "{\"diaryTitle\":\"제주 여행\",\"coverColor\":\"#A8C8E8\",\"coverStyle\":\"PLAIN\",\"visibility\":\"MEMBERS\"}")
public class DiaryUpdateRequest {

	@Size(min = 1, max = 100)
	private String diaryTitle;

	@Pattern(regexp = "#[0-9a-fA-F]{6}")
	private String coverColor;

	@Size(max = 30)
	@Pattern(regexp = "(?s).*\\S.*")
	private String coverStyle;

	@Pattern(regexp = "PRIVATE|MEMBERS|LINK")
	private String visibility;

	@JsonSetter(nulls = Nulls.FAIL)
	public void setDiaryTitle(String diaryTitle) {
		this.diaryTitle = diaryTitle.strip();
	}

	@JsonSetter(nulls = Nulls.FAIL)
	public void setCoverColor(String coverColor) {
		this.coverColor = coverColor;
	}

	@JsonSetter(nulls = Nulls.FAIL)
	public void setCoverStyle(String coverStyle) {
		this.coverStyle = coverStyle;
	}

	@JsonSetter(nulls = Nulls.FAIL)
	public void setVisibility(String visibility) {
		this.visibility = visibility;
	}

	@JsonAnySetter
	public void rejectUnsupportedField(String name, Object value) {
		throw new IllegalArgumentException("수정할 수 없는 필드입니다: " + name);
	}

	@AssertTrue(message = "수정할 필드를 하나 이상 전달해 주세요.")
	@Schema(hidden = true)
	public boolean isAnyFieldPresent() {
		return diaryTitle != null || coverColor != null || coverStyle != null || visibility != null;
	}

	public String getDiaryTitle() { return diaryTitle; }
	public String getCoverColor() { return coverColor; }
	public String getCoverStyle() { return coverStyle; }
	public String getVisibility() { return visibility; }
}
