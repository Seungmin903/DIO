package com.f106.DIO.page.dto;

import java.math.BigDecimal;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/** Swagger의 application/x-www-form-urlencoded 필드 입력용 페이지 수정 폼. */
public class PageUpdateForm {
	@Positive @Schema(example = "1") private Long templateId;
	@Schema(description = "속지 설정 JSON", example = "{\"paperColor\":\"#FFFDF7\"}") private String templateConfig;
	@Size(min = 1, max = 100) @Pattern(regexp = "(?s).*\\S.*") @Schema(example = "수정한 제목") private String title;
	@DecimalMin("0.01") @Digits(integer = 8, fraction = 2) @Schema(example = "1280") private BigDecimal canvasWidth;
	@DecimalMin("0.01") @Digits(integer = 8, fraction = 2) @Schema(example = "800") private BigDecimal canvasHeight;
	@Schema(example = "true") private Boolean gridVisible;
	@Pattern(regexp = "#[0-9a-fA-F]{6}") @Schema(example = "#D9D9D9") private String gridColor;

	public void setTemplateId(Long value) { templateId = value; }
	public void setTemplateConfig(String value) { templateConfig = value; }
	public void setTitle(String value) { title = value; }
	public void setCanvasWidth(BigDecimal value) { canvasWidth = value; }
	public void setCanvasHeight(BigDecimal value) { canvasHeight = value; }
	public void setGridVisible(Boolean value) { gridVisible = value; }
	public void setGridColor(String value) { gridColor = value; }
	@AssertTrue(message = "수정할 필드를 하나 이상 전달해야 합니다.") public boolean isAnyFieldPresent() { return templateId != null || (templateConfig != null && !templateConfig.isBlank()) || title != null || canvasWidth != null || canvasHeight != null || gridVisible != null || gridColor != null; }
	@AssertTrue(message = "canvasWidth와 canvasHeight는 함께 전달해야 합니다.") public boolean isCanvasSizeComplete() { return (canvasWidth == null) == (canvasHeight == null); }

	public PageUpdateRequest toRequest() {
		PageUpdateRequest request = new PageUpdateRequest();
		if (templateId != null) request.setTemplateId(templateId);
		if (templateConfig != null && !templateConfig.isBlank()) request.setTemplateConfig(FormJson.parse(templateConfig, JsonPayloadLimits.MAX_TEMPLATE_CONFIG_BYTES, "templateConfig"));
		if (title != null) request.setTitle(title);
		if (canvasWidth != null) request.setCanvasWidth(canvasWidth);
		if (canvasHeight != null) request.setCanvasHeight(canvasHeight);
		if (gridVisible != null) request.setGridVisible(gridVisible);
		if (gridColor != null) request.setGridColor(gridColor);
		return request;
	}
}
