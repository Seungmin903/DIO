package com.f106.DIO.page.dto;
import java.math.BigDecimal;
import java.time.Instant;
import tools.jackson.databind.JsonNode;
public record PageData(String pageId,String diaryId,Long templateId,JsonNode templateConfig,String title,BigDecimal sortKey,BigDecimal canvasWidth,BigDecimal canvasHeight,boolean gridVisible,String gridColor,long version,Instant createdAt,Instant updatedAt,String templateCode,String templateVersion) { }
