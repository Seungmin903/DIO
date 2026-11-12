package com.f106.DIO.page.dto;
import java.util.List;
public record PageListResponse(List<PageData> items, tools.jackson.databind.JsonNode paperAppearance) {
    public PageListResponse(List<PageData> items) { this(items,null); }
}
