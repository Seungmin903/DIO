package com.f106.DIO.page.service;

import java.util.UUID;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import com.f106.DIO.page.domain.CanvasElement;
import com.f106.DIO.page.domain.DiaryPage;
import com.f106.DIO.page.dto.CanvasElementData;
import com.f106.DIO.page.dto.PageData;

/** 엔티티는 jsonb를 문자열로 들고, API 경계에서만 JsonNode로 바꾼다(Hibernate JSON 매퍼는 Jackson 2 기준). */
final class PageMapper {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private PageMapper() { }

	static PageData toPageData(DiaryPage page) {
		return new PageData(page.getPageId().toString(), page.getDiaryId().toString(), page.getTemplateId(),
			toNode(page.getTemplateConfig()), page.getTitle(), page.getSortKey(), page.getCanvasWidth(), page.getCanvasHeight(),
			page.isGridVisible(), page.getGridColor(), page.getVersion(), page.getCreatedAt(), page.getUpdatedAt());
	}

	static CanvasElementData toElementData(CanvasElement element) {
		return new CanvasElementData(element.getElementId().toString(), element.getPageId().toString(),
			element.getElementType(), id(element.getGroupId()), element.getName(), element.getSortKey(),
			element.getX(), element.getY(), element.getWidth(), element.getHeight(), element.getRotation(),
			element.getOpacity(), element.isLocked(), element.isHidden(), id(element.getMediaFileId()),
			toNode(element.getPropertiesJson()), element.getVersion(), element.getCreatedAt(), element.getUpdatedAt());
	}

	static String toJson(JsonNode value) {
		return value == null ? null : JSON.writeValueAsString(value);
	}

	private static JsonNode toNode(String value) {
		return value == null ? null : JSON.readTree(value);
	}

	private static String id(UUID value) {
		return value == null ? null : value.toString();
	}
}
