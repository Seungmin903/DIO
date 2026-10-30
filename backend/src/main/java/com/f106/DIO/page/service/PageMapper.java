package com.f106.DIO.page.service;
import com.f106.DIO.page.domain.*;
import com.f106.DIO.page.dto.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
final class PageMapper {
	private static final JsonMapper JSON = JsonMapper.builder().build();
	private PageMapper() { }
	static PageData toPageData(DiaryPage p){return toPageData(p,null);}
    static PageData toPageData(DiaryPage p,PageTemplate template){return new PageData(p.getPageId().toString(),p.getDiaryId().toString(),p.getTemplateId(),copy(p.getTemplateConfig()),p.getTitle(),p.getSortKey(),p.getCanvasWidth(),p.getCanvasHeight(),p.isGridVisible(),p.getGridColor(),p.getVersion(),p.getCreatedAt(),p.getUpdatedAt(),template==null?null:template.getCode(),template==null?null:template.getTemplateVersion());}
	static CanvasElementData toElementData(CanvasElement e){return new CanvasElementData(e.getElementId().toString(),e.getPageId().toString(),e.getElementType(),id(e.getGroupId()),e.getName(),e.getSortKey(),e.getX(),e.getY(),e.getWidth(),e.getHeight(),e.getRotation(),e.getOpacity(),e.isLocked(),e.isHidden(),id(e.getMediaFileId()),copy(e.getPropertiesJson()),e.getVersion(),e.getCreatedAt(),e.getUpdatedAt());}
	private static String id(java.util.UUID value){return value==null?null:value.toString();}
	private static JsonNode copy(String value){
		if(value==null)return null;
		try{return JSON.readTree(value);}catch(Exception exception){throw new IllegalStateException("저장된 JSON을 읽을 수 없습니다.",exception);}
	}
}
