package com.f106.DIO.page.dto;
import java.math.BigDecimal;
import com.fasterxml.jackson.annotation.*;
import tools.jackson.databind.JsonNode;
import jakarta.validation.constraints.*;
public class PageCreateRequest {
	@Positive private Long templateId; private JsonNode templateConfig;
	@Size(min=1,max=100) @Pattern(regexp="(?s).*\\S.*") private String title;
	@DecimalMin("0.01") @Digits(integer=8,fraction=2) private BigDecimal canvasWidth;
	@DecimalMin("0.01") @Digits(integer=8,fraction=2) private BigDecimal canvasHeight;
	private Boolean gridVisible; @Pattern(regexp="#[0-9a-fA-F]{6}") private String gridColor;
	@JsonSetter(nulls=Nulls.FAIL) public void setTemplateId(Long value){templateId=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setTemplateConfig(JsonNode value){templateConfig=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setTitle(String value){title=value.strip();}
	@JsonSetter(nulls=Nulls.FAIL) public void setCanvasWidth(BigDecimal value){canvasWidth=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setCanvasHeight(BigDecimal value){canvasHeight=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setGridVisible(Boolean value){gridVisible=value;}
	@JsonSetter(nulls=Nulls.FAIL) public void setGridColor(String value){gridColor=value;}
	@AssertTrue(message="canvasWidth와 canvasHeight를 함께 전달해 주세요.") public boolean isCanvasSizeComplete(){return (canvasWidth==null)==(canvasHeight==null);}
	@AssertTrue(message="templateConfig는 512KiB 이하여야 해요.") public boolean isTemplateConfigSizeValid(){return JsonPayloadLimits.fits(templateConfig,JsonPayloadLimits.MAX_TEMPLATE_CONFIG_BYTES);}
	public Long getTemplateId(){return templateId;} public JsonNode getTemplateConfig(){return templateConfig;} public String getTitle(){return title;}
	public BigDecimal getCanvasWidth(){return canvasWidth;} public BigDecimal getCanvasHeight(){return canvasHeight;}
	public Boolean getGridVisible(){return gridVisible;} public String getGridColor(){return gridColor;}
}
