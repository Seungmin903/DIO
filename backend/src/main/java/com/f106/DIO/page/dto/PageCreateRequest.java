package com.f106.DIO.page.dto;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import tools.jackson.databind.JsonNode;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/** 페이지를 만들 때 필요한 속지·캔버스 설정이다. */
public class PageCreateRequest {

	@Positive
	private Long templateId;
	private JsonNode templateConfig;
	@Size(min = 1, max = 100)
	@Pattern(regexp = "(?s).*\\S.*")
	private String title;
	@DecimalMin(value = "0.01")
	@Digits(integer = 8, fraction = 2)
	private BigDecimal canvasWidth;
	@DecimalMin(value = "0.01")
	@Digits(integer = 8, fraction = 2)
	private BigDecimal canvasHeight;
	private Boolean gridVisible;
	@Pattern(regexp = "#[0-9a-fA-F]{6}")
	private String gridColor;

	@JsonSetter(nulls = Nulls.FAIL)
	public void setTemplateId(Long templateId) { this.templateId = templateId; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setTemplateConfig(JsonNode templateConfig) { this.templateConfig = templateConfig; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setTitle(String title) { this.title = title.strip(); }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setCanvasWidth(BigDecimal canvasWidth) { this.canvasWidth = canvasWidth; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setCanvasHeight(BigDecimal canvasHeight) { this.canvasHeight = canvasHeight; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setGridVisible(Boolean gridVisible) { this.gridVisible = gridVisible; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setGridColor(String gridColor) { this.gridColor = gridColor; }

	@AssertTrue(message = "canvasWidth와 canvasHeight는 함께 전달해야 합니다.")
	public boolean isCanvasSizeComplete() {
		return (canvasWidth == null) == (canvasHeight == null);
	}

	public Long getTemplateId() { return templateId; }
	public JsonNode getTemplateConfig() { return templateConfig; }
	public String getTitle() { return title; }
	public BigDecimal getCanvasWidth() { return canvasWidth; }
	public BigDecimal getCanvasHeight() { return canvasHeight; }
	public Boolean getGridVisible() { return gridVisible; }
	public String getGridColor() { return gridColor; }
}
