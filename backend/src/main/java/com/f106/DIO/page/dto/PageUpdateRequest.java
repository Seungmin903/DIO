package com.f106.DIO.page.dto;
import java.math.BigDecimal;
import com.fasterxml.jackson.annotation.*;
import tools.jackson.databind.JsonNode;
import jakarta.validation.constraints.*;
/** 생략한 필드는 유지하고 null·미지원 필드는 거절하는 부분 수정 요청. */
public class PageUpdateRequest {
	@Positive private Long templateId; private JsonNode templateConfig;
	private JsonNode paperAppearance;
	private Boolean applyPaperAppearanceToAllPages;
	@Size(min=1,max=100) @Pattern(regexp="(?s).*\\S.*") private String title;
	@DecimalMin("0.01") @Digits(integer=8,fraction=2) private BigDecimal canvasWidth;
	@DecimalMin("0.01") @Digits(integer=8,fraction=2) private BigDecimal canvasHeight;
	private Boolean gridVisible; @Pattern(regexp="#[0-9a-fA-F]{6}") private String gridColor;
	@JsonSetter(nulls=Nulls.FAIL) public void setTemplateId(Long value){templateId=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setTemplateConfig(JsonNode value){templateConfig=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setPaperAppearance(JsonNode value){paperAppearance=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setApplyPaperAppearanceToAllPages(Boolean value){applyPaperAppearanceToAllPages=value;}
	public JsonNode getPaperAppearance(){return paperAppearance;}
	public boolean appliesPaperAppearanceToAllPages(){return Boolean.TRUE.equals(applyPaperAppearanceToAllPages);}
	@AssertTrue(message="속지 스타일은 다른 페이지 설정과 따로 수정해 주세요.")
	public boolean isPaperAppearanceRequestValid(){
		if(paperAppearance==null)return applyPaperAppearanceToAllPages==null;
		return templateId==null&&templateConfig==null&&title==null&&canvasWidth==null&&canvasHeight==null&&gridVisible==null&&gridColor==null;
	}
	@JsonSetter(nulls=Nulls.FAIL) public void setTitle(String value){title=value.strip();}
	@JsonSetter(nulls=Nulls.FAIL) public void setCanvasWidth(BigDecimal value){canvasWidth=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setCanvasHeight(BigDecimal value){canvasHeight=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setGridVisible(Boolean value){gridVisible=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setGridColor(String value){gridColor=value;}
	@JsonAnySetter public void rejectUnsupportedField(String name,Object value){throw new IllegalArgumentException("수정할 수 없는 페이지 필드입니다: "+name);}
	@AssertTrue(message="수정할 필드를 하나 이상 전달해야 합니다.") public boolean isAnyFieldPresent(){return templateId!=null||templateConfig!=null||title!=null||canvasWidth!=null||canvasHeight!=null||gridVisible!=null||gridColor!=null||paperAppearance!=null;}
	@AssertTrue(message="canvasWidth와 canvasHeight는 함께 전달해야 합니다.") public boolean isCanvasSizeComplete(){return (canvasWidth==null)==(canvasHeight==null);}
	@AssertTrue(message="templateConfig는 512KiB 이하여야 합니다.") public boolean isTemplateConfigSizeValid(){return JsonPayloadLimits.fits(templateConfig,JsonPayloadLimits.MAX_TEMPLATE_CONFIG_BYTES);}
	public Long getTemplateId(){return templateId;} public JsonNode getTemplateConfig(){return templateConfig;} public String getTitle(){return title;}
	public BigDecimal getCanvasWidth(){return canvasWidth;} public BigDecimal getCanvasHeight(){return canvasHeight;}
	public Boolean getGridVisible(){return gridVisible;} public String getGridColor(){return gridColor;}
}
