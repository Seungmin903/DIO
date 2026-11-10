package com.f106.DIO.page.dto;

import java.math.BigDecimal;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Swagger의 application/x-www-form-urlencoded 필드 입력용 요소 수정 폼. */
public class CanvasElementUpdateForm {
	@NotNull @Schema(description = "마지막으로 조회한 요소 version", example = "1") private Long version;
	private UUID groupId, mediaFileId;
	@Size(min = 1, max = 100) @Pattern(regexp = "(?s).*\\S.*") @Schema(example = "수정한 이름") private String name;
	@Digits(integer = 10, fraction = 10) @Schema(example = "3") private BigDecimal sortKey;
	@Digits(integer = 9, fraction = 3) @Schema(example = "120") private BigDecimal x, y;
	@DecimalMin("0.001") @Digits(integer = 9, fraction = 3) @Schema(example = "320") private BigDecimal w, h;
	@Digits(integer = 4, fraction = 3) @Schema(example = "0") private BigDecimal rotation;
	@DecimalMin("0") @DecimalMax("1") @Digits(integer = 1, fraction = 3) @Schema(example = "1") private BigDecimal opacity;
	@Schema(example = "false") private Boolean locked, hidden;
	@Schema(description = "요소별 추가 속성 JSON", example = "{\"text\":\"수정한 텍스트\"}") private String propertiesJson;

	public void setGroupId(UUID value) { groupId = value; } public void setMediaFileId(UUID value) { mediaFileId = value; }
	public void setName(String value) { name = value; } public void setSortKey(BigDecimal value) { sortKey = value; }
	public void setX(BigDecimal value) { x = value; } public void setY(BigDecimal value) { y = value; }
	public void setW(BigDecimal value) { w = value; } public void setH(BigDecimal value) { h = value; }
	public void setRotation(BigDecimal value) { rotation = value; } public void setOpacity(BigDecimal value) { opacity = value; }
	public void setLocked(Boolean value) { locked = value; } public void setHidden(Boolean value) { hidden = value; }
	public void setPropertiesJson(String value) { propertiesJson = value; } public void setVersion(Long value) { version = value; }
	@AssertTrue(message = "수정할 필드를 하나 이상 전달해 주세요.") public boolean isAnyFieldPresent() { return groupId != null || mediaFileId != null || name != null || sortKey != null || x != null || y != null || w != null || h != null || rotation != null || opacity != null || locked != null || hidden != null || (propertiesJson != null && !propertiesJson.isBlank()); }

	public CanvasElementUpdateRequest toRequest() {
		CanvasElementUpdateRequest request = new CanvasElementUpdateRequest();
		if (version != null) request.setVersion(version);
		if (groupId != null) request.setGroupId(groupId); if (mediaFileId != null) request.setMediaFileId(mediaFileId);
		if (name != null) request.setName(name); if (sortKey != null) request.setSortKey(sortKey);
		if (x != null) request.setX(x); if (y != null) request.setY(y);
		if (w != null) request.setWidth(w); if (h != null) request.setHeight(h);
		if (rotation != null) request.setRotation(rotation); if (opacity != null) request.setOpacity(opacity);
		if (locked != null) request.setIsLocked(locked); if (hidden != null) request.setIsHidden(hidden);
		if (propertiesJson != null && !propertiesJson.isBlank()) request.setPropertiesJson(FormJson.parse(propertiesJson, JsonPayloadLimits.MAX_ELEMENT_PROPERTIES_BYTES, "propertiesJson"));
		return request;
	}
}
