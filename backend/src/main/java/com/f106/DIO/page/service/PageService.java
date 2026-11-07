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
		diaryAccessService.requireWrite(diaryId,userId);
        // 앱은 templateId 없이 설정의 templateCode · templateVersion 으로 속지를 알린다. 그 글자로 속지 행을 찾아 template_id 를 채워 저장한다(V35 와 같은 기준)
        PageTemplate t=resolveTemplate(r.getTemplateId(),r.getTemplateConfig()); Long templateId=t==null?null:t.getTemplateId();
        // 원격 속지(V34)는 형식에 맞는 remoteTemplate 이 있어야 하고 다른 속지에는 둘 수 없다(공유 구성원 앱이 이 값으로 속지를 찾는다)
        RemoteTemplates.requireValidConfig(r.getTemplateConfig(),t==null?null:t.getCode());
        String requestId=r.getTemplateConfig()==null?null:r.getTemplateConfig().path("clientPageRequestId").asText(null);
        if(requestId!=null){
            UUID.fromString(requestId);
            var locked=diaries.findForUpdate(diaryId).orElseThrow(com.f106.DIO.diary.support.DiaryNotFoundException::new);
            entities.refresh(locked);
            // Re-check membership after waiting for the aggregate lock.
            diaryAccessService.requireWrite(diaryId,userId);
            for(var existing:pageRepository.findCreationRequestCandidates(diaryId,requestId)){
                if(existing.getTemplateConfig()==null)continue;
                var config=JSON.readTree(existing.getTemplateConfig());
                if(!requestId.equals(config.path("clientPageRequestId").asText(null)))continue;
                if(existing.getDeletedAt()!=null||!sameConfig(config,r.getTemplateConfig())||!Objects.equals(existing.getTemplateId(),templateId)
                    ||!Objects.equals(existing.getTitle(),r.getTitle())||existing.getCanvasWidth().compareTo(r.getCanvasWidth()==null?width(t):r.getCanvasWidth())!=0
                    ||existing.getCanvasHeight().compareTo(r.getCanvasHeight()==null?height(t):r.getCanvasHeight())!=0
                    ||existing.isGridVisible()!=Boolean.TRUE.equals(r.getGridVisible())||!Objects.equals(existing.getGridColor(),r.getGridColor()))throw new PageCreationConflictException();
                return new PageResponse(pageData(existing));
            }
        }
		DiaryPage page=new DiaryPage(diaryId,templateId,r.getTemplateConfig()==null?defaultConfig(t):copy(r.getTemplateConfig()),r.getTitle(),nextSortKey(diaryId),r.getCanvasWidth()==null?width(t):r.getCanvasWidth(),r.getCanvasHeight()==null?height(t):r.getCanvasHeight(),Boolean.TRUE.equals(r.getGridVisible()),r.getGridColor());
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
		if(replaceTemplateConfig){
			// 원격 속지 페이지에서 속지를 바꾸지 않고 설정만 통째로 바꾸면(속지 글꼴 변경 등) 속지 정체(templateCode · templateVersion · remoteTemplate)를
			// 저장된 설정에서 이어받는다. 앱은 templateId 없이 설정의 templateCode 로 속지를 알리므로, 빠지면 모든 구성원에게 빈 페이지가 된다.
			// 일반 속지 페이지는 예전처럼 보낸 설정을 그대로 저장한다(templateCode 를 빼서 빈 종이로 바꾸는 요청을 막지 않는다)
			String code=t!=null?t.getCode():currentTemplateCode(page);
			if(t==null&&RemoteTemplates.isRemoteCode(code))templateConfig=preserveTemplateIdentity(page.getTemplateConfig(),templateConfig);
			// 원격 속지 페이지에 원격 행 templateId 만 보내면(같은 행 다시 지정 · 방향 바꾸기) 행 기본 설정에는 remoteTemplate 이 없으므로 저장된 값을 이어받는다.
			// 일반 페이지를 원격 행으로 바꿀 때는 어떤 속지인지 모르므로 templateConfig.remoteTemplate 이 꼭 있어야 한다(없으면 400)
			if(t!=null&&r.getTemplateConfig()==null&&RemoteTemplates.isRemoteCode(code)&&RemoteTemplates.isRemoteCode(currentTemplateCode(page)))
				templateConfig=inheritRemoteTemplate(page.getTemplateConfig(),templateConfig);
			JsonNode next=templateConfig==null?null:JSON.readTree(templateConfig);
			// 속지 변경은 templateId 로만 한다. 설정의 templateCode 는 지금 속지(templateId 를 보냈으면 그 행)와 같아야 한다.
			// 다르면 template_id 와 설정이 서로 다른 속지를 가리키게 되므로 받지 않는다(원격 ↔ 일반, 원격 방향 바꾸기, 빈 종이 → 속지 모두 포함)
			String nextCode=next!=null&&next.path("templateCode").isString()?next.get("templateCode").asString():null;
			if(nextCode!=null&&!nextCode.equals(code))
				throw new IllegalArgumentException(t!=null?"templateId 와 설정의 templateCode 가 다릅니다.":"설정으로 속지를 바꿀 수 없습니다. 속지 변경은 templateId 로 합니다.");
			// 원격 속지 규칙은 실제로 저장될 설정으로 검사한다
			RemoteTemplates.requireValidConfig(next,code);
			templateConfig=preserveCreationRequestId(page.getTemplateConfig(),templateConfig);
		}
		page.updateSettings(r.getTemplateId(),templateConfig,replaceTemplateConfig,r.getTitle(),w,h,r.getGridVisible(),r.getGridColor()); pageRepository.flush(); events.publishEvent(new PageCatalogChanged(page.getDiaryId())); return new PageResponse(pageData(page));
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
    private static final List<String> TEMPLATE_IDENTITY_KEYS=List.of("templateCode","templateVersion",RemoteTemplates.CONFIG_KEY);
    /** 새 설정에 없는 속지 정체 키를 이전 설정에서 이어받는다. 새 설정이 직접 적은 값은 그대로 둔다 */
    private static String preserveTemplateIdentity(String previous,String replacement){
        var old=previous==null?null:JSON.readTree(previous);
        if(old==null||!old.isObject()||TEMPLATE_IDENTITY_KEYS.stream().noneMatch(old::has))return replacement;
        var next=replacement==null?JSON.createObjectNode():JSON.readTree(replacement);
        if(!(next instanceof tools.jackson.databind.node.ObjectNode object))return replacement;
        for(String key:TEMPLATE_IDENTITY_KEYS)if(old.has(key)&&!object.has(key))object.set(key,old.get(key));
        return object.toString();
    }
    /** 저장된 설정의 remoteTemplate 을 새 설정에 옮긴다(새 설정에 이미 있으면 그대로) */
    private static String inheritRemoteTemplate(String previous,String replacement){
        var old=previous==null?null:JSON.readTree(previous);
        if(old==null||!old.has(RemoteTemplates.CONFIG_KEY))return replacement;
        var next=replacement==null?JSON.createObjectNode():JSON.readTree(replacement);
        if(!(next instanceof tools.jackson.databind.node.ObjectNode object))return replacement;
        if(!object.has(RemoteTemplates.CONFIG_KEY))object.set(RemoteTemplates.CONFIG_KEY,old.get(RemoteTemplates.CONFIG_KEY));
        return object.toString();
    }
    private static String preserveCreationRequestId(String previous,String replacement){
        var old=previous==null?null:JSON.readTree(previous);
        var requestId=old==null?null:old.get("clientPageRequestId");
        var next=replacement==null?null:JSON.readTree(replacement);
        var supplied=next==null?null:next.get("clientPageRequestId");
        if(supplied!=null&&!supplied.equals(requestId))throw new IllegalArgumentException("clientPageRequestId는 변경할 수 없습니다.");
        if(requestId==null)return replacement;
        if(next==null)next=JSON.createObjectNode();
        if(!(next instanceof tools.jackson.databind.node.ObjectNode object))throw new IllegalArgumentException("생성 요청 ID가 있는 페이지 설정은 객체여야 합니다.");
        object.set("clientPageRequestId",requestId);
        return object.toString();
    }
    private static boolean sameConfig(JsonNode a,JsonNode b){
        if(a==null||b==null)return a==b;
        if(a.isNumber()&&b.isNumber())return a.decimalValue().compareTo(b.decimalValue())==0;
        if(a.isObject()&&b.isObject())return a.size()==b.size()&&a.properties().stream().allMatch(e->sameConfig(e.getValue(),b.get(e.getKey())));
        if(a.isArray()&&b.isArray()){
            if(a.size()!=b.size())return false;
            for(int i=0;i<a.size();i++)if(!sameConfig(a.get(i),b.get(i)))return false;
            return true;
        }
        return a.equals(b);
    }
    private static String copyTemplateConfig(String config){
        if(config==null)return null;
        var tree=JSON.readTree(config);
        if(tree instanceof tools.jackson.databind.node.ObjectNode object)object.remove("clientPageRequestId");
        return tree.toString();
    }
	/** 지금 페이지의 속지 코드: 연결된 템플릿 행, 없으면 저장된 설정의 templateCode. 모르면 null */
	private String currentTemplateCode(DiaryPage page){
		if(page.getTemplateId()!=null)return templateRepository.findById(page.getTemplateId()).map(PageTemplate::getCode).orElse(null);
		if(page.getTemplateConfig()==null)return null;
		JsonNode code=JSON.readTree(page.getTemplateConfig()).path("templateCode");
		return code.isString()?code.asString():null;
	}
	/**
	 * 새 페이지의 속지 행. templateId 가 있으면 그 행, 설정에 templateCode 가 있으면 code · templateVersion 이 같은 활성 행.
	 * 둘 다 있으면 같은 행이어야 한다. 없는 코드 · 버전이면 400 (오타 · 옛 코드가 저장되면 모든 구성원에게 속지가 깨진다)
	 */
	private PageTemplate resolveTemplate(Long id,JsonNode config){
		PageTemplate t=findTemplate(id);
		if(config==null||!config.isObject()||!config.has("templateCode"))return t;
		if(!config.path("templateCode").isString()||!config.path("templateVersion").isString())throw new IllegalArgumentException("templateCode 와 templateVersion 은 함께 문자열로 보내야 합니다.");
		var rows=templateRepository.findAllByCodeAndTemplateVersionAndIsActiveTrue(config.get("templateCode").asString(),config.get("templateVersion").asString());
		if(rows.size()!=1)throw new IllegalArgumentException("없는 속지 코드 · 버전입니다.");
		PageTemplate byCode=rows.get(0);
		if(t!=null&&!t.getTemplateId().equals(byCode.getTemplateId()))throw new IllegalArgumentException("templateId 와 설정의 templateCode 가 다릅니다.");
		return byCode;
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
