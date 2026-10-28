package com.f106.DIO.page.dto;
import java.math.BigDecimal;
import java.time.Instant;
import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.JsonNode;
public record CanvasElementData(String elementId,String pageId,String elementType,String groupId,String name,BigDecimal sortKey,BigDecimal x,BigDecimal y,BigDecimal width,BigDecimal height,BigDecimal rotation,BigDecimal opacity,@JsonProperty("isLocked") boolean isLocked,@JsonProperty("isHidden") boolean isHidden,String mediaFileId,JsonNode propertiesJson,long version,Instant createdAt,Instant updatedAt) { }
