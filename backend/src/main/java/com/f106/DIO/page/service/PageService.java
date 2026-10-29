package com.f106.DIO.page.service;

import java.math.BigDecimal;
import java.util.*;
import tools.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.diary.service.DiaryAccessService;
import com.f106.DIO.page.domain.*;
import com.f106.DIO.page.dto.*;
import com.f106.DIO.page.repository.*;
import com.f106.DIO.page.support.*;

@Service
public class PageService {
	private static final BigDecimal DEFAULT_CANVAS_WIDTH=new BigDecimal("1280.00"),DEFAULT_CANVAS_HEIGHT=new BigDecimal("800.00"),SORT_STEP=BigDecimal.ONE;
	private final org.springframework.context.ApplicationEventPublisher events;
    private final com.f106.DIO.diary.repository.DiaryRepository diaries;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entities;
    private static final tools.jackson.databind.json.JsonMapper JSON=tools.jackson.databind.json.JsonMapper.builder().build();
	private final DiaryPageRepository pageRepository; private final PageTemplateRepository templateRepository; private final CanvasElementRepository elementRepository; private final DiaryAccessService diaryAccessService;
	public PageService(DiaryPageRepository pageRepository,PageTemplateRepository templateRepository,CanvasElementRepository elementRepository,DiaryAccessService diaryAccessService,org.springframework.context.ApplicationEventPublisher events,com.f106.DIO.diary.repository.DiaryRepository diaries){this.events=events;this.diaries=diaries;this.pageRepository=pageRepository;this.templateRepository=templateRepository;this.elementRepository=elementRepository;this.diaryAccessService=diaryAccessService;}

	@Transactional(readOnly=true) public PageListResponse list(UUID diaryId,Long userId){diaryAccessService.requireRead(diaryId,userId);return listWithoutDiaryCheck(diaryId);}
	@Transactional public PageResponse create(UUID diaryId,PageCreateRequest r,Long userId){
		diaryAccessService.requireWrite(diaryId,userId); PageTemplate t=findTemplate(r.getTemplateId());
        String requestId=r.getTemplateConfig()==null?null:r.getTemplateConfig().path("clientPageRequestId").asText(null);
        if(requestId!=null){
            UUID.fromString(requestId);
            var locked=diaries.findForUpdate(diaryId).orElseThrow(com.f106.DIO.diary.support.DiaryNotFoundException::new);
            entities.refresh(locked);
            // Re-check membership after waiting for the aggregate lock.
            diaryAccessService.requireWrite(diaryId,userId);
            for(var existing:pageRepository.findAllByDiaryIdOrderByCreatedAtAscPageIdAsc(diaryId)){
                if(existing.getTemplateConfig()==null)continue;
                var config=JSON.readTree(existing.getTemplateConfig());
                if(!requestId.equals(config.path("clientPageRequestId").asText(null)))continue;
                if(existing.getDeletedAt()!=null||!config.equals(r.getTemplateConfig())||!Objects.equals(existing.getTemplateId(),r.getTemplateId())
                    ||!Objects.equals(existing.getTitle(),r.getTitle())||existing.getCanvasWidth().compareTo(r.getCanvasWidth()==null?width(t):r.getCanvasWidth())!=0
                    ||existing.getCanvasHeight().compareTo(r.getCanvasHeight()==null?height(t):r.getCanvasHeight())!=0
                    ||existing.isGridVisible()!=Boolean.TRUE.equals(r.getGridVisible())||!Objects.equals(existing.getGridColor(),r.getGridColor()))throw new PageCreationConflictException();
                return new PageResponse(pageData(existing));
            }
        }
		DiaryPage page=new DiaryPage(diaryId,r.getTemplateId(),r.getTemplateConfig()==null?defaultConfig(t):copy(r.getTemplateConfig()),r.getTitle(),nextSortKey(diaryId),r.getCanvasWidth()==null?width(t):r.getCanvasWidth(),r.getCanvasHeight()==null?height(t):r.getCanvasHeight(),Boolean.TRUE.equals(r.getGridVisible()),r.getGridColor());
		pageRepository.saveAndFlush(page); events.publishEvent(new PageCatalogChanged(diaryId));return new PageResponse(pageData(page));
	}
	@Transactional(readOnly=true) public PageDetailResponse detail(UUID pageId,Long userId){
		DiaryPage page=requirePage(pageId); diaryAccessService.requireRead(page.getDiaryId(),userId); return new PageDetailResponse(pageData(page),elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId).stream().map(PageMapper::toElementData).toList());
	}
	@Transactional public PageResponse update(UUID pageId,PageUpdateRequest r,Long userId){
		DiaryPage page=requirePage(pageId); diaryAccessService.requireWrite(page.getDiaryId(),userId); PageTemplate t=findTemplate(r.getTemplateId()); BigDecimal w=r.getCanvasWidth(),h=r.getCanvasHeight();
		if(t!=null&&w==null){w=t.getCanvasWidth();h=t.getCanvasHeight();}
		boolean replaceTemplateConfig=r.getTemplateConfig()!=null||t!=null;
		String templateConfig=r.getTemplateConfig()==null?defaultConfig(t):copy(r.getTemplateConfig());
		page.updateSettings(r.getTemplateId(),templateConfig,replaceTemplateConfig,r.getTitle(),w,h,r.getGridVisible(),r.getGridColor()); pageRepository.flush(); return new PageResponse(pageData(page));
	}
	@Transactional public PageResponse copy(UUID pageId,Long userId){
		DiaryPage source=requirePage(pageId); diaryAccessService.requireWrite(source.getDiaryId(),userId); DiaryPage copied=new DiaryPage(source.getDiaryId(),source.getTemplateId(),copyTemplateConfig(source.getTemplateConfig()),source.getTitle(),nextSortKey(source.getDiaryId()),source.getCanvasWidth(),source.getCanvasHeight(),source.isGridVisible(),source.getGridColor());
		pageRepository.saveAndFlush(copied);
		Map<UUID,UUID> copiedGroups=new HashMap<>();
		elementRepository.saveAll(elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId).stream().map(e->e.copyFor(copied.getPageId(),e.getSortKey(),e.getGroupId()==null?null:copiedGroups.computeIfAbsent(e.getGroupId(),g->UUID.randomUUID()),userId)).toList()); elementRepository.flush();
		events.publishEvent(new PageCatalogChanged(source.getDiaryId()));return new PageResponse(pageData(copied));
	}
	@Transactional public PageListResponse reorder(UUID diaryId,PageOrderRequest r,Long userId){
		diaryAccessService.requireWrite(diaryId,userId); List<DiaryPage> pages=pageRepository.findAllByDiaryIdAndDeletedAtIsNullOrderBySortKeyAscPageIdAsc(diaryId); Set<UUID> expected=pages.stream().map(DiaryPage::getPageId).collect(java.util.stream.Collectors.toSet()); Set<UUID> received=new HashSet<>(r.pageIds());
		if(received.size()!=r.pageIds().size()||!received.equals(expected))throw new IllegalArgumentException("현재 다이어리의 삭제되지 않은 페이지 ID를 중복 없이 모두 전달해야 합니다.");
		Map<UUID,DiaryPage> byId=pages.stream().collect(java.util.stream.Collectors.toMap(DiaryPage::getPageId,p->p)); for(int i=0;i<r.pageIds().size();i++)byId.get(r.pageIds().get(i)).reorder(BigDecimal.valueOf(i+1L)); pageRepository.flush();events.publishEvent(new PageCatalogChanged(diaryId)); return listWithoutDiaryCheck(diaryId);
	}
	@Transactional public void delete(UUID pageId,Long userId){DiaryPage page=requirePage(pageId);diaryAccessService.requireWrite(page.getDiaryId(),userId);page.softDelete();pageRepository.flush();events.publishEvent(new PageCatalogChanged(page.getDiaryId()));}
	@Transactional(readOnly=true) public DiaryPage requirePage(UUID pageId){return pageRepository.findByPageIdAndDeletedAtIsNull(pageId).orElseThrow(PageNotFoundException::new);}
	@Transactional(readOnly=true) public DiaryPage requireReadablePage(UUID pageId,Long userId){DiaryPage page=requirePage(pageId);diaryAccessService.requireRead(page.getDiaryId(),userId);return page;}
	@Transactional(readOnly=true) public DiaryPage requireWritablePage(UUID pageId,Long userId){DiaryPage page=requirePage(pageId);diaryAccessService.requireWrite(page.getDiaryId(),userId);return page;}
    private static String copyTemplateConfig(String config){
        if(config==null)return null;
        var tree=JSON.readTree(config);
        if(tree instanceof tools.jackson.databind.node.ObjectNode object)object.remove("clientPageRequestId");
        return tree.toString();
    }
	private PageTemplate findTemplate(Long id){return id==null?null:templateRepository.findByTemplateIdAndIsActiveTrue(id).orElseThrow(PageTemplateNotFoundException::new);}
	private BigDecimal nextSortKey(UUID diaryId){BigDecimal max=pageRepository.findMaxSortKeyByDiaryId(diaryId);return max==null?SORT_STEP:max.add(SORT_STEP);}
	private PageData pageData(DiaryPage page){return PageMapper.toPageData(page,page.getTemplateId()==null?null:templateRepository.findById(page.getTemplateId()).orElse(null));}
    private PageListResponse listWithoutDiaryCheck(UUID id){
        var pages=pageRepository.findAllByDiaryIdAndDeletedAtIsNullOrderBySortKeyAscPageIdAsc(id);
        var ids=pages.stream().map(DiaryPage::getTemplateId).filter(java.util.Objects::nonNull).collect(java.util.stream.Collectors.toSet());
        var templates=templateRepository.findAllById(ids).stream().collect(java.util.stream.Collectors.toMap(PageTemplate::getTemplateId,t->t));
        return new PageListResponse(pages.stream().map(p->PageMapper.toPageData(p,templates.get(p.getTemplateId()))).toList());
    }
	private static BigDecimal width(PageTemplate t){return t==null?DEFAULT_CANVAS_WIDTH:t.getCanvasWidth();} private static BigDecimal height(PageTemplate t){return t==null?DEFAULT_CANVAS_HEIGHT:t.getCanvasHeight();}
	private static String defaultConfig(PageTemplate t){return t==null?null:t.getDefaultConfig();} private static String copy(JsonNode v){return v==null?null:v.toString();}
}
