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
	example = "{\"diaryTitle\":\"제주 여행\",\"coverColor\":\"#A8C8E8\",\"coverPattern\":\"LEATHER\",\"bindingType\":\"RING\"}")
public class DiaryUpdateRequest {

	@Size(min = 1, max = 100)
	private String diaryTitle;

	@Pattern(regexp = "#[0-9a-fA-F]{6}")
	private String coverColor;

	@Pattern(regexp = "LINEN|LEATHER|DOT|GINGHAM|STRIPE")
	private String coverPattern;

	@Size(max = 30)
	@Pattern(regexp = "(?s).*\\S.*")
	private String bindingType;

	@JsonSetter(nulls = Nulls.FAIL)
	public void setDiaryTitle(String diaryTitle) {
		this.diaryTitle = diaryTitle.strip();
	}

	@JsonSetter(nulls = Nulls.FAIL)
	public void setCoverColor(String coverColor) {
		this.coverColor = coverColor;
	}

	@JsonSetter(nulls = Nulls.FAIL)
	public void setCoverPattern(String coverPattern) {
		this.coverPattern = coverPattern;
	}

	@JsonSetter(nulls = Nulls.FAIL)
	public void setBindingType(String bindingType) {
		this.bindingType = bindingType;
	}

	@JsonAnySetter
	public void rejectUnsupportedField(String name, Object value) {
		throw new IllegalArgumentException("수정할 수 없는 필드입니다: " + name);
	}

	@AssertTrue(message = "수정할 필드를 하나 이상 전달해야 합니다.")
	@Schema(hidden = true)
	public boolean isAnyFieldPresent() {
		return diaryTitle != null || coverColor != null || coverPattern != null || bindingType != null;
	}

	public String getDiaryTitle() { return diaryTitle; }
	public String getCoverColor() { return coverColor; }
	public String getCoverPattern() { return coverPattern; }
	public String getBindingType() { return bindingType; }
}
