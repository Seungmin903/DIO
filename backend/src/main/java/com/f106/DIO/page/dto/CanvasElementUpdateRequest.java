package com.f106.DIO.page.dto;
import java.math.BigDecimal;
import java.util.UUID;
import com.fasterxml.jackson.annotation.*;
import tools.jackson.databind.JsonNode;
import jakarta.validation.constraints.*;
public class CanvasElementUpdateRequest {
	private UUID elementId,groupId,mediaFileId;
	@Size(min=1,max=100) @Pattern(regexp="(?s).*\\S.*") private String name;
	@Digits(integer=10,fraction=10) private BigDecimal sortKey;
	@Digits(integer=9,fraction=3) private BigDecimal x,y;
	@DecimalMin("0.001") @Digits(integer=9,fraction=3) private BigDecimal width,height;
	@Digits(integer=4,fraction=3) private BigDecimal rotation;
	@DecimalMin("0") @DecimalMax("1") @Digits(integer=1,fraction=3) private BigDecimal opacity;
	private Boolean isLocked,isHidden; private JsonNode propertiesJson;
	/** 클라이언트가 마지막으로 받은 요소 버전. 서버 버전과 다르면 409로 거절한다. */
	@NotNull(message="version은 필수입니다.") private Long version;
	@JsonSetter(nulls=Nulls.FAIL) public void setElementId(UUID value){elementId=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setGroupId(UUID value){groupId=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setName(String value){name=value.strip();}
	@JsonSetter(nulls=Nulls.FAIL) public void setSortKey(BigDecimal value){sortKey=value;}
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
	@JsonSetter(nulls=Nulls.FAIL) public void setVersion(Long value){version=value;}
	@JsonAnySetter public void rejectUnsupportedField(String name,Object value){throw new IllegalArgumentException("수정할 수 없는 요소 필드입니다: "+name);}
	@AssertTrue(message="수정할 필드를 하나 이상 전달해야 합니다.") public boolean isAnyFieldPresent(){return groupId!=null||name!=null||sortKey!=null||x!=null||y!=null||width!=null||height!=null||rotation!=null||opacity!=null||isLocked!=null||isHidden!=null||mediaFileId!=null||propertiesJson!=null;}
	@AssertTrue(message="propertiesJson은 128KiB 이하여야 합니다.") public boolean isPropertiesJsonSizeValid(){return JsonPayloadLimits.fits(propertiesJson,JsonPayloadLimits.MAX_ELEMENT_PROPERTIES_BYTES);}
	public UUID getElementId(){return elementId;} public UUID getGroupId(){return groupId;} public String getName(){return name;} public BigDecimal getSortKey(){return sortKey;} public BigDecimal getX(){return x;} public BigDecimal getY(){return y;} public BigDecimal getWidth(){return width;} public BigDecimal getHeight(){return height;} public BigDecimal getRotation(){return rotation;} public BigDecimal getOpacity(){return opacity;} public Boolean getIsLocked(){return isLocked;} public Boolean getIsHidden(){return isHidden;} public UUID getMediaFileId(){return mediaFileId;} public JsonNode getPropertiesJson(){return propertiesJson;} public Long getVersion(){return version;}
}
