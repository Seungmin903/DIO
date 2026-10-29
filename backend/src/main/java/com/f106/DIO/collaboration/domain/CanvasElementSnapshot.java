package com.f106.DIO.collaboration.domain;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
public record CanvasElementSnapshot(UUID elementId,UUID pageId,String elementType,UUID groupId,String name,
    BigDecimal sortKey,BigDecimal x,BigDecimal y,BigDecimal width,BigDecimal height,BigDecimal rotation,BigDecimal opacity,
    boolean isLocked,boolean isHidden,UUID mediaFileId,JsonNode propertiesJson,Long createdBy,long version,
    Instant createdAt,Instant updatedAt,Instant deletedAt){}
