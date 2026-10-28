package com.f106.DIO.page.dto;

import java.math.BigDecimal;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Swagger의 application/x-www-form-urlencoded 필드 입력용 요소 생성 폼. */
public class CanvasElementCreateForm {
	@Schema(description = "선택값. 프런트에서 만든 UUID를 유지할 때 사용") private UUID elementId;
	@NotNull @Pattern(regexp = "(?i)TEXT|PHOTO|STICKER|TAPE|STROKE|SHAPE") @Schema(example = "TEXT") private String type;
	@Schema(example = "텍스트") private UUID groupId;
	@Size(min = 1, max = 100) @Pattern(regexp = "(?s).*\\S.*") @Schema(example = "제목") private String name;
	@NotNull @Digits(integer = 9, fraction = 3) @Schema(example = "100") private BigDecimal x;
	@NotNull @Digits(integer = 9, fraction = 3) @Schema(example = "120") private BigDecimal y;
	@NotNull @DecimalMin("0.001") @Digits(integer = 9, fraction = 3) @Schema(example = "320") private BigDecimal w;
	@NotNull @DecimalMin("0.001") @Digits(integer = 9, fraction = 3) @Schema(example = "80") private BigDecimal h;
	@Digits(integer = 4, fraction = 3) @Schema(example = "0") private BigDecimal rotation;
	@DecimalMin("0") @DecimalMax("1") @Digits(integer = 1, fraction = 3) @Schema(example = "1") private BigDecimal opacity;
	@Schema(example = "false") private Boolean locked;
	@Schema(example = "false") private Boolean hidden;
	@Schema(description = "서버에 등록된 미디어 UUID") private UUID mediaFileId;
	@Schema(description = "요소별 추가 속성 JSON", example = "{\"text\":\"안녕하세요\",\"fontSize\":28}") private String propertiesJson;

	public void setElementId(UUID value) { elementId = value; } public void setType(String value) { type = value; }
	public void setGroupId(UUID value) { groupId = value; } public void setName(String value) { name = value; }
	public void setX(BigDecimal value) { x = value; } public void setY(BigDecimal value) { y = value; }
	public void setW(BigDecimal value) { w = value; } public void setH(BigDecimal value) { h = value; }
	public void setRotation(BigDecimal value) { rotation = value; } public void setOpacity(BigDecimal value) { opacity = value; }
	public void setLocked(Boolean value) { locked = value; } public void setHidden(Boolean value) { hidden = value; }
	public void setMediaFileId(UUID value) { mediaFileId = value; } public void setPropertiesJson(String value) { propertiesJson = value; }

	public CanvasElementCreateRequest toRequest() {
		CanvasElementCreateRequest request = new CanvasElementCreateRequest();
		if (elementId != null) request.setElementId(elementId);
		request.setElementType(type); if (groupId != null) request.setGroupId(groupId); if (name != null) request.setName(name);
		request.setX(x); request.setY(y); request.setWidth(w); request.setHeight(h);
		if (rotation != null) request.setRotation(rotation); if (opacity != null) request.setOpacity(opacity);
		if (locked != null) request.setIsLocked(locked); if (hidden != null) request.setIsHidden(hidden);
		if (mediaFileId != null) request.setMediaFileId(mediaFileId);
		if (propertiesJson != null && !propertiesJson.isBlank()) request.setPropertiesJson(FormJson.parse(propertiesJson, JsonPayloadLimits.MAX_ELEMENT_PROPERTIES_BYTES, "propertiesJson"));
		return request;
	}
}
