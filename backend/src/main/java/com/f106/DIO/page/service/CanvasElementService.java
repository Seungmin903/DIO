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
import com.f106.DIO.page.support.MediaFileNotSupportedException;

@Service
public class CanvasElementService {

	private static final BigDecimal SORT_STEP = BigDecimal.ONE;

	private final PageService pageService;
	private final CanvasElementRepository elementRepository;
	private final com.f106.DIO.collaboration.service.CanvasChangeJournal journal;

	public CanvasElementService(PageService pageService, CanvasElementRepository elementRepository, com.f106.DIO.collaboration.service.CanvasChangeJournal journal) {
		this.pageService = pageService;
		this.elementRepository = elementRepository;
		this.journal = journal;
	}

	@Transactional(readOnly = true)
	public CanvasElementListResponse list(UUID pageId, Long userId) {
		pageService.requireReadablePage(pageId, userId);
		return listWithoutPageCheck(pageId);
	}

	@Transactional
	public CanvasElementResponse create(UUID pageId, CanvasElementCreateRequest request, Long userId) {
        pageService.requireWritablePage(pageId,userId);
        if(request.getElementId()==null)request.setElementId(UUID.randomUUID());
        var ticket=journal.begin(pageId,userId,List.of(request.getElementId()),UUID.randomUUID(),null,"CREATE");
		if (request.getElementId() != null && elementRepository.existsById(request.getElementId())) {
			throw new IllegalArgumentException("이미 사용 중인 elementId입니다.");
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
		applyUpdate(element, request);
		elementRepository.flush();
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

		BigDecimal nextSortKey = nextSortKey(pageId);
		for (CanvasElementCreateRequest create : safe(request.creates())) {
			if (create.getElementId() != null && elementRepository.existsById(create.getElementId())) {
				throw new IllegalArgumentException("이미 사용 중인 elementId입니다.");
			}
			elementRepository.save(newElement(pageId, create, nextSortKey, userId));
			nextSortKey = nextSortKey.add(SORT_STEP);
		}
		for (CanvasElementUpdateRequest update : safe(request.updates())) {
			CanvasElement element = requireActiveElement(pageId, update.getElementId());
			applyUpdate(element, update);
		}
		for (UUID elementId : safe(request.deleteElementIds())) requireActiveElement(pageId, elementId).softDelete();
		for (UUID elementId : safe(request.restoreElementIds())) {
			CanvasElement element = elementRepository.findByElementIdAndPageId(elementId, pageId).orElseThrow(CanvasElementNotFoundException::new);
			if (element.getDeletedAt() == null) throw new ElementNotDeletedException();
			element.restore();
		}
		elementRepository.flush();
        journal.complete(ticket);
		return listWithoutPageCheck(pageId);
	}

	private CanvasElement newElement(UUID pageId, CanvasElementCreateRequest request, BigDecimal sortKey, Long userId) {
		validateReferences(pageId, request.getGroupId(), request.getMediaFileId());
		return new CanvasElement(request.getElementId(), pageId, request.getElementType(), request.getGroupId(),
			request.getName(), request.getSortKey()==null?sortKey:request.getSortKey(), request.getX(), request.getY(), request.getWidth(), request.getHeight(),
			request.getRotation() == null ? BigDecimal.ZERO : request.getRotation(),
			request.getOpacity() == null ? BigDecimal.ONE : request.getOpacity(),
			Boolean.TRUE.equals(request.getIsLocked()), Boolean.TRUE.equals(request.getIsHidden()), request.getMediaFileId(),
			request.getPropertiesJson() == null ? null : request.getPropertiesJson().toString(), userId);
	}

	private void applyUpdate(CanvasElement element, CanvasElementUpdateRequest request) {
		// 오래된 화면 기준의 수정이 다른 편집자의 변경을 덮어쓰지 않게 한다.
		if (!request.getVersion().equals(element.getVersion())) throw new CanvasElementVersionConflictException();
		validateReferences(element.getPageId(), request.getGroupId(), request.getMediaFileId());
		element.update(request.getGroupId(), request.getName(), request.getSortKey(), request.getX(), request.getY(),
			request.getWidth(), request.getHeight(), request.getRotation(), request.getOpacity(), request.getIsLocked(),
			request.getIsHidden(), request.getMediaFileId(),
			request.getPropertiesJson() == null ? null : request.getPropertiesJson().toString());
	}

	/** Asset attachment remains deferred until the existing asset API and access contract are available. */
	private void validateReferences(UUID pageId, UUID groupId, UUID mediaFileId) {
		if (mediaFileId != null) throw new MediaFileNotSupportedException();
		if (groupId != null && elementRepository.existsByGroupIdAndPageIdNot(groupId, pageId)) {
			throw new IllegalArgumentException("다른 페이지에서 사용 중인 groupId입니다.");
		}
	}

	private CanvasElement requireActiveElement(UUID pageId, UUID elementId) {
		return elementRepository.findByElementIdAndPageIdAndDeletedAtIsNull(elementId, pageId)
			.orElseThrow(CanvasElementNotFoundException::new);
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
				throw new IllegalArgumentException("하나의 요소에 여러 일괄 작업을 적용할 수 없습니다.");
			}
		}
		for (CanvasElementUpdateRequest update : safe(request.updates())) {
			if (update.getElementId() == null) { throw new IllegalArgumentException("updates의 elementId는 필수입니다."); }
			if (!ids.add(update.getElementId())) { throw new IllegalArgumentException("하나의 요소에 여러 일괄 작업을 적용할 수 없습니다."); }
		}
		validateIds(ids, request.deleteElementIds());
		validateIds(ids, request.restoreElementIds());
	}

	private void validateIds(Set<UUID> seen, List<UUID> values) {
		for (UUID value : safe(values)) {
			if (value == null || !seen.add(value)) {
				throw new IllegalArgumentException("하나의 요소에 여러 일괄 작업을 적용할 수 없습니다.");
			}
		}
	}

	private static <T> List<T> safe(List<T> values) {
		return values == null ? List.of() : values;
	}
}
