package com.f106.DIO.page.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.page.domain.CanvasElement;
import com.f106.DIO.page.dto.CanvasElementBatchRequest;
import com.f106.DIO.page.dto.CanvasElementCreateRequest;
import com.f106.DIO.page.dto.CanvasElementListResponse;
import com.f106.DIO.page.dto.CanvasElementResponse;
import com.f106.DIO.page.dto.CanvasElementUpdateRequest;
import com.f106.DIO.page.repository.CanvasElementRepository;
import com.f106.DIO.page.support.CanvasElementNotFoundException;
import com.f106.DIO.page.support.CanvasElementVersionConflictException;
import com.f106.DIO.page.support.ElementNotDeletedException;

@Service
public class CanvasElementService {

	private static final BigDecimal SORT_STEP = BigDecimal.ONE;
    private static final BigDecimal MAX_SORT_KEY = new BigDecimal("9999999999.9999999999");

	private final PageService pageService;
    private final com.f106.DIO.media.service.CanvasMediaAccess mediaAccess;
	private final CanvasElementRepository elementRepository;
	private final com.f106.DIO.collaboration.service.CanvasChangeJournal journal;
	private final PhotoAlbumPlacement albumPlacement;

	public CanvasElementService(PageService pageService, CanvasElementRepository elementRepository, com.f106.DIO.collaboration.service.CanvasChangeJournal journal, com.f106.DIO.media.service.CanvasMediaAccess mediaAccess, PhotoAlbumPlacement albumPlacement) {
		this.pageService = pageService;this.mediaAccess=mediaAccess;
		this.elementRepository = elementRepository;
		this.journal = journal;
		this.albumPlacement = albumPlacement;
	}

	@Transactional(readOnly = true)
	public CanvasElementListResponse list(UUID pageId, Long userId) {
		pageService.requireReadablePage(pageId, userId);
		return listWithoutPageCheck(pageId);
	}

    public void ensureAlbumHistorySlots(UUID pageId, java.util.Map<String, com.f106.DIO.collaboration.domain.CanvasElementSnapshot> desired) {
        if (desired.values().stream().noneMatch(s -> s != null && s.deletedAt() == null && "PHOTO".equals(s.elementType()) && s.propertiesJson() != null && s.propertiesJson().has("albumSlot"))) return;
        var page = pageService.requirePage(pageId);
        albumPlacement.ensureHistorySlots(page.getTemplateConfig(), page.getCanvasWidth(), page.getCanvasHeight(),
            () -> elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId), desired);
    }

	@Transactional
	public CanvasElementResponse create(UUID pageId, CanvasElementCreateRequest request, Long userId) {
        pageService.requireWritablePage(pageId,userId);
        if(request.getElementId()==null)request.setElementId(UUID.randomUUID());
        var ticket=journal.begin(pageId,userId,List.of(request.getElementId()),UUID.randomUUID(),null,"CREATE");
		if (albumPlacement.candidate(request)) {
			var page = pageService.requirePage(pageId);
			var taken = albumPlacement.occupied(page.getTemplateConfig(), page.getCanvasWidth(), page.getCanvasHeight(), () -> elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId));
			albumPlacement.place(request, page.getCanvasWidth().compareTo(page.getCanvasHeight()) < 0, taken);
		}
		if (request.getElementId() != null && elementRepository.existsById(request.getElementId())) {
			throw new IllegalArgumentException("이미 사용 중인 elementId예요.");
		}
		CanvasElement element = newElement(pageId, request, nextSortKey(pageId), userId);
		elementRepository.saveAndFlush(element);
        journal.complete(ticket);
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public CanvasElementResponse update(UUID pageId, UUID elementId, CanvasElementUpdateRequest request, Long userId) {
        pageService.requireWritablePage(pageId,userId);
        var ticket=journal.begin(pageId,userId,List.of(elementId),UUID.randomUUID(),null,"UPDATE");
		CanvasElement element = requireActiveElement(pageId, elementId);
		var placementBefore = albumPlacement.snapshot(element);
		applyUpdate(element, request, userId);
		elementRepository.flush();
		if (albumPlacement.changesAlbumPlacement(element, placementBefore))
			checkUpdatedAlbumSlots(pageId, java.util.Map.of(elementId, placementBefore));
        journal.complete(ticket);
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public void delete(UUID pageId, UUID elementId, Long userId) {
        pageService.requireWritablePage(pageId,userId);
        var ticket=journal.begin(pageId,userId,List.of(elementId),UUID.randomUUID(),null,"DELETE");
		requireActiveElement(pageId, elementId).softDelete();
		elementRepository.flush();
        journal.complete(ticket);
	}

	@Transactional
	public CanvasElementResponse restore(UUID pageId, UUID elementId, Long userId) {
        pageService.requireWritablePage(pageId,userId);
        var ticket=journal.begin(pageId,userId,List.of(elementId),UUID.randomUUID(),null,"RESTORE");
		CanvasElement element = elementRepository.findByElementIdAndPageId(elementId, pageId)
			.orElseThrow(CanvasElementNotFoundException::new);
		if (element.getDeletedAt() == null) { throw new ElementNotDeletedException(); }
		element.restore();
		elementRepository.flush();
        checkRestoredAlbumSlots(pageId, Set.of(elementId));
        journal.complete(ticket);
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public CanvasElementListResponse batch(UUID pageId, CanvasElementBatchRequest request, Long userId) {
        return batchTracked(pageId,request,userId,UUID.randomUUID(),null);
    }
    @Transactional
    public CanvasElementListResponse batchTracked(UUID pageId,CanvasElementBatchRequest request,Long userId,UUID clientId,String hash){
        pageService.requireWritablePage(pageId,userId);
        for(var create:safe(request.creates()))if(create.getElementId()==null)create.setElementId(UUID.randomUUID());
        validateBatchIds(request);
        var ids=new java.util.LinkedHashSet<UUID>();
        safe(request.creates()).forEach(c->ids.add(c.getElementId()));safe(request.updates()).forEach(u->ids.add(u.getElementId()));
        ids.addAll(safe(request.deleteElementIds()));ids.addAll(safe(request.restoreElementIds()));
        var ticket=journal.begin(pageId,userId,ids,clientId,hash,"BATCH");
        pageService.requireWritablePage(pageId,userId);
		// Preserve the pre-batch layer allocation even when this batch updates or deletes the top layer.
		BigDecimal nextSortKey = nextSortKey(pageId);
		var updatedElements = new java.util.LinkedHashMap<UUID, CanvasElement>();
		var placementBefore = new java.util.LinkedHashMap<UUID, PhotoAlbumPlacement.PlacementSnapshot>();
		for (CanvasElementUpdateRequest update : safe(request.updates())) {
			CanvasElement element = requireActiveElement(pageId, update.getElementId());
			updatedElements.put(update.getElementId(), element);
			placementBefore.put(update.getElementId(), albumPlacement.snapshot(element));
			applyUpdate(element, update, userId);
		}
		for (UUID elementId : safe(request.deleteElementIds())) requireActiveElement(pageId, elementId).softDelete();
		for (UUID elementId : safe(request.restoreElementIds())) {
			CanvasElement element = elementRepository.findByElementIdAndPageId(elementId, pageId).orElseThrow(CanvasElementNotFoundException::new);
			if (element.getDeletedAt() == null) throw new ElementNotDeletedException();
			element.restore();
		}
		elementRepository.flush();
        checkRestoredAlbumSlots(pageId, new HashSet<>(safe(request.restoreElementIds())));
		var changedPlacements = new java.util.LinkedHashMap<UUID, PhotoAlbumPlacement.PlacementSnapshot>();
		updatedElements.forEach((id, element) -> {
			var before = placementBefore.get(id);
			if (albumPlacement.changesAlbumPlacement(element, before)) changedPlacements.put(id, before);
		});
		checkUpdatedAlbumSlots(pageId, changedPlacements);
		var page = safe(request.creates()).stream().anyMatch(albumPlacement::candidate) ? pageService.requirePage(pageId) : null;
		var taken = page == null ? null : albumPlacement.occupied(page.getTemplateConfig(), page.getCanvasWidth(), page.getCanvasHeight(), () -> elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId));
		for (CanvasElementCreateRequest create : safe(request.creates())) {
			if (taken != null) albumPlacement.place(create, page.getCanvasWidth().compareTo(page.getCanvasHeight()) < 0, taken);
			if (create.getElementId() != null && elementRepository.existsById(create.getElementId())) throw new IllegalArgumentException("이미 사용 중인 elementId예요.");
			elementRepository.save(newElement(pageId, create, nextSortKey, userId));
			nextSortKey = nextSortKey.add(SORT_STEP);
		}
		elementRepository.flush();
        journal.complete(ticket);
		return listWithoutPageCheck(pageId);
	}

    private void checkRestoredAlbumSlots(UUID pageId, Set<UUID> restored) {
        if (restored.isEmpty()) return;
        var page = pageService.requirePage(pageId);
        albumPlacement.ensureRestoredSlots(page.getTemplateConfig(), page.getCanvasWidth(), page.getCanvasHeight(),
            () -> elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId), restored);
    }

    private void checkUpdatedAlbumSlots(UUID pageId, java.util.Map<UUID, PhotoAlbumPlacement.PlacementSnapshot> changed) {
        if (changed.isEmpty()) return;
        var page = pageService.requirePage(pageId);
        albumPlacement.ensureUpdatedSlots(page.getTemplateConfig(), page.getCanvasWidth(), page.getCanvasHeight(),
            () -> elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId), changed);
    }

	private CanvasElement newElement(UUID pageId, CanvasElementCreateRequest request, BigDecimal sortKey, Long userId) {
		validateReferences(pageId, request.getGroupId(), request.getMediaFileId(), request.getPropertiesJson(), userId);
		return new CanvasElement(request.getElementId(), pageId, request.getElementType(), request.getGroupId(),
			request.getName(), checkedSortKey(request.getSortKey()==null?sortKey:request.getSortKey()), request.getX(), request.getY(), request.getWidth(), request.getHeight(),
			request.getRotation() == null ? BigDecimal.ZERO : request.getRotation(),
			request.getOpacity() == null ? BigDecimal.ONE : request.getOpacity(),
			Boolean.TRUE.equals(request.getIsLocked()), Boolean.TRUE.equals(request.getIsHidden()), request.getMediaFileId(),
			request.getPropertiesJson() == null ? null : request.getPropertiesJson().toString(), userId);
	}

	private void applyUpdate(CanvasElement element, CanvasElementUpdateRequest request, Long userId) {
		// 오래된 화면 기준의 수정이 다른 편집자의 변경을 덮어쓰지 않게 한다.
		if (!request.getVersion().equals(element.getVersion())) throw new CanvasElementVersionConflictException();
		validateReferences(element.getPageId(), request.getGroupId(), request.getMediaFileId(), request.getPropertiesJson(), userId);
		element.update(request.getGroupId(), request.getName(), request.getSortKey(), request.getX(), request.getY(),
			request.getWidth(), request.getHeight(), request.getRotation(), request.getOpacity(), request.getIsLocked(),
			request.getIsHidden(), request.getMediaFileId(),
			request.getPropertiesJson() == null ? null : request.getPropertiesJson().toString());
	}

	/** Reuse existing media APIs without accepting another user's private image IDs. */
	private void validateReferences(UUID pageId, UUID groupId, UUID mediaFileId, tools.jackson.databind.JsonNode properties, Long userId) {
		mediaAccess.requireAttach(pageId, mediaFileId, properties, userId);
		if (groupId != null && elementRepository.existsByGroupIdAndPageIdNot(groupId, pageId)) {
			throw new IllegalArgumentException("다른 페이지에서 사용 중인 groupId예요.");
		}
	}

	private CanvasElement requireActiveElement(UUID pageId, UUID elementId) {
		return elementRepository.findByElementIdAndPageIdAndDeletedAtIsNull(elementId, pageId)
			.orElseThrow(CanvasElementNotFoundException::new);
	}

    private static BigDecimal checkedSortKey(BigDecimal value) {
        if(value.abs().compareTo(MAX_SORT_KEY)>0||Math.max(0,value.stripTrailingZeros().scale())>10)
            throw new IllegalArgumentException("레이어 순서 범위를 초과했어요. 기존 요소의 순서를 조정한 뒤 다시 시도해 주세요.");
        return value;
    }

	private BigDecimal nextSortKey(UUID pageId) {
		BigDecimal max = elementRepository.findMaxSortKeyByPageId(pageId);
		return max == null ? SORT_STEP : max.add(SORT_STEP);
	}

	private CanvasElementListResponse listWithoutPageCheck(UUID pageId) {
		return new CanvasElementListResponse(elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId)
			.stream().map(PageMapper::toElementData).toList());
	}

	private void validateBatchIds(CanvasElementBatchRequest request) {
		Set<UUID> ids = new HashSet<>();
		for (CanvasElementCreateRequest create : safe(request.creates())) {
			if (create.getElementId() != null && !ids.add(create.getElementId())) {
				throw new IllegalArgumentException("하나의 요소에 여러 일괄 작업을 적용할 수 없어요.");
			}
		}
		for (CanvasElementUpdateRequest update : safe(request.updates())) {
			if (update.getElementId() == null) { throw new IllegalArgumentException("updates의 elementId가 필요해요."); }
			if (!ids.add(update.getElementId())) { throw new IllegalArgumentException("하나의 요소에 여러 일괄 작업을 적용할 수 없어요."); }
		}
		validateIds(ids, request.deleteElementIds());
		validateIds(ids, request.restoreElementIds());
	}

	private void validateIds(Set<UUID> seen, List<UUID> values) {
		for (UUID value : safe(values)) {
			if (value == null || !seen.add(value)) {
				throw new IllegalArgumentException("하나의 요소에 여러 일괄 작업을 적용할 수 없어요.");
			}
		}
	}

	private static <T> List<T> safe(List<T> values) {
		return values == null ? List.of() : values;
	}
}
