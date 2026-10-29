package com.f106.DIO.page.dto;
import java.math.BigDecimal;
import java.util.*;
import com.fasterxml.jackson.annotation.*;
import tools.jackson.databind.JsonNode;
import jakarta.validation.constraints.*;
/** 프런트 객체의 type/w/h/locked/hidden 별칭도 지원한다. */
public class CanvasElementCreateRequest {
	private UUID elementId;
    @Digits(integer=10,fraction=10) private BigDecimal sortKey;
    public BigDecimal getSortKey(){return sortKey;}
    @JsonSetter(nulls=Nulls.FAIL) public void setSortKey(BigDecimal value){sortKey=value;}
	@NotNull @Pattern(regexp="TEXT|PHOTO|STICKER|TAPE|STROKE|SHAPE") private String elementType;
	private UUID groupId; @Size(min=1,max=100) @Pattern(regexp="(?s).*\\S.*") private String name;
	@NotNull @Digits(integer=9,fraction=3) private BigDecimal x;
	@NotNull @Digits(integer=9,fraction=3) private BigDecimal y;
	@NotNull @DecimalMin("0.001") @Digits(integer=9,fraction=3) private BigDecimal width;
	@NotNull @DecimalMin("0.001") @Digits(integer=9,fraction=3) private BigDecimal height;
	@Digits(integer=4,fraction=3) private BigDecimal rotation;
	@DecimalMin("0") @DecimalMax("1") @Digits(integer=1,fraction=3) private BigDecimal opacity;
	private Boolean isLocked; private Boolean isHidden; private UUID mediaFileId; private JsonNode propertiesJson;
	@JsonSetter(nulls=Nulls.FAIL) public void setElementId(UUID value){elementId=value;}
	@JsonSetter(nulls=Nulls.FAIL) @JsonAlias("type") public void setElementType(String value){elementType=value.toUpperCase(Locale.ROOT);}
	@JsonSetter(nulls=Nulls.FAIL) public void setGroupId(UUID value){groupId=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setName(String value){name=value.strip();}
	@JsonSetter(nulls=Nulls.FAIL) public void setX(BigDecimal value){x=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setY(BigDecimal value){y=value;}
	@JsonSetter(nulls=Nulls.FAIL) @JsonAlias("w") public void setWidth(BigDecimal value){width=value;}
	@JsonSetter(nulls=Nulls.FAIL) @JsonAlias("h") public void setHeight(BigDecimal value){height=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setRotation(BigDecimal value){rotation=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setOpacity(BigDecimal value){opacity=value;}
	@JsonSetter(nulls=Nulls.FAIL) @JsonAlias("locked") public void setIsLocked(Boolean value){isLocked=value;}
	@JsonSetter(nulls=Nulls.FAIL) @JsonAlias("hidden") public void setIsHidden(Boolean value){isHidden=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setMediaFileId(UUID value){mediaFileId=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setPropertiesJson(JsonNode value){propertiesJson=value;}
	@AssertTrue(message="propertiesJson은 128KiB 이하여야 합니다.") public boolean isPropertiesJsonSizeValid(){return JsonPayloadLimits.fits(propertiesJson,JsonPayloadLimits.MAX_ELEMENT_PROPERTIES_BYTES);}
	public UUID getElementId(){return elementId;} public String getElementType(){return elementType;} public UUID getGroupId(){return groupId;} public String getName(){return name;}
	public BigDecimal getX(){return x;} public BigDecimal getY(){return y;} public BigDecimal getWidth(){return width;} public BigDecimal getHeight(){return height;} public BigDecimal getRotation(){return rotation;} public BigDecimal getOpacity(){return opacity;}
	public Boolean getIsLocked(){return isLocked;} public Boolean getIsHidden(){return isHidden;} public UUID getMediaFileId(){return mediaFileId;} public JsonNode getPropertiesJson(){return propertiesJson;}
}
