package com.f106.DIO.page.dto;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import tools.jackson.databind.JsonNode;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 요소 생성 요청. 프런트의 type/w/h/locked/hidden 별칭도 받아 서버 표준 필드로 저장한다. */
public class CanvasElementCreateRequest {

	private UUID elementId;
	@NotNull
	@Pattern(regexp = "TEXT|PHOTO|STICKER|TAPE|STROKE|SHAPE")
	private String elementType;
	private UUID groupId;
	@Size(min = 1, max = 100) @Pattern(regexp = "(?s).*\\S.*") private String name;
	@Digits(integer = 10, fraction = 10) private BigDecimal sortKey;
	@NotNull @Digits(integer = 9, fraction = 3) private BigDecimal x;
	@NotNull @Digits(integer = 9, fraction = 3) private BigDecimal y;
	@NotNull @DecimalMin(value = "0.001") @Digits(integer = 9, fraction = 3) private BigDecimal width;
	@NotNull @DecimalMin(value = "0.001") @Digits(integer = 9, fraction = 3) private BigDecimal height;
	@Digits(integer = 4, fraction = 3) private BigDecimal rotation;
	@DecimalMin(value = "0") @DecimalMax(value = "1") @Digits(integer = 1, fraction = 3) private BigDecimal opacity;
	private Boolean isLocked;
	private Boolean isHidden;
	private UUID mediaFileId;
	private JsonNode propertiesJson;

	@JsonSetter(nulls = Nulls.FAIL)
	public void setElementId(UUID elementId) { this.elementId = elementId; }
	@JsonSetter(nulls = Nulls.FAIL)
	@JsonAlias("type")
	public void setElementType(String elementType) { this.elementType = elementType.toUpperCase(Locale.ROOT); }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setGroupId(UUID groupId) { this.groupId = groupId; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setName(String name) { this.name = name.strip(); }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setSortKey(BigDecimal sortKey) { this.sortKey = sortKey; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setX(BigDecimal x) { this.x = x; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setY(BigDecimal y) { this.y = y; }
	@JsonSetter(nulls = Nulls.FAIL)
	@JsonAlias("w")
	public void setWidth(BigDecimal width) { this.width = width; }
	@JsonSetter(nulls = Nulls.FAIL)
	@JsonAlias("h")
	public void setHeight(BigDecimal height) { this.height = height; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setRotation(BigDecimal rotation) { this.rotation = rotation; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setOpacity(BigDecimal opacity) { this.opacity = opacity; }
	@JsonSetter(nulls = Nulls.FAIL)
	@JsonAlias("locked")
	public void setIsLocked(Boolean isLocked) { this.isLocked = isLocked; }
	@JsonSetter(nulls = Nulls.FAIL)
	@JsonAlias("hidden")
	public void setIsHidden(Boolean isHidden) { this.isHidden = isHidden; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setMediaFileId(UUID mediaFileId) { this.mediaFileId = mediaFileId; }
	@JsonSetter(nulls = Nulls.FAIL)
	public void setPropertiesJson(JsonNode propertiesJson) { this.propertiesJson = propertiesJson; }

	public UUID getElementId() { return elementId; }
	public String getElementType() { return elementType; }
	public UUID getGroupId() { return groupId; }
	public String getName() { return name; }
	public BigDecimal getSortKey() { return sortKey; }
	public BigDecimal getX() { return x; }
	public BigDecimal getY() { return y; }
	public BigDecimal getWidth() { return width; }
	public BigDecimal getHeight() { return height; }
	public BigDecimal getRotation() { return rotation; }
	public BigDecimal getOpacity() { return opacity; }
	public Boolean getIsLocked() { return isLocked; }
	public Boolean getIsHidden() { return isHidden; }
	public UUID getMediaFileId() { return mediaFileId; }
	public JsonNode getPropertiesJson() { return propertiesJson; }
}
