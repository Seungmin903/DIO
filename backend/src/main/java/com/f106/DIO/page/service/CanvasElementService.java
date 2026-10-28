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
import com.f106.DIO.page.support.ElementNotDeletedException;

@Service
public class CanvasElementService {

	private static final BigDecimal SORT_STEP = BigDecimal.ONE;

	private final PageService pageService;
	private final CanvasElementRepository elementRepository;

	public CanvasElementService(PageService pageService, CanvasElementRepository elementRepository) {
		this.pageService = pageService;
		this.elementRepository = elementRepository;
	}

	@Transactional(readOnly = true)
	public CanvasElementListResponse list(UUID pageId) {
		pageService.requirePage(pageId);
		return listWithoutPageCheck(pageId);
	}

	@Transactional(readOnly = true)
	public CanvasElementListResponse list(UUID pageId, Long userId) {
		pageService.requireReadablePage(pageId, userId);
		return listWithoutPageCheck(pageId);
	}

	@Transactional
	public CanvasElementResponse create(UUID pageId, CanvasElementCreateRequest request) {
		pageService.requirePage(pageId);
		if (request.getElementId() != null && elementRepository.existsById(request.getElementId())) {
			throw new IllegalArgumentException("이미 사용 중인 elementId입니다.");
		}
		CanvasElement element = newElement(pageId, request, nextSortKey(pageId));
		elementRepository.saveAndFlush(element);
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public CanvasElementResponse create(UUID pageId, CanvasElementCreateRequest request, Long userId) {
		pageService.requireWritablePage(pageId, userId);
		if (request.getElementId() != null && elementRepository.existsById(request.getElementId())) {
			throw new IllegalArgumentException("이미 사용 중인 elementId입니다.");
		}
		CanvasElement element = newElement(pageId, request, nextSortKey(pageId), userId);
		elementRepository.saveAndFlush(element);
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public CanvasElementResponse update(UUID pageId, UUID elementId, CanvasElementUpdateRequest request) {
		pageService.requirePage(pageId);
		CanvasElement element = requireActiveElement(pageId, elementId);
		applyUpdate(element, request);
		elementRepository.flush();
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public CanvasElementResponse update(UUID pageId, UUID elementId, CanvasElementUpdateRequest request, Long userId) {
		pageService.requireWritablePage(pageId, userId);
		CanvasElement element = requireActiveElement(pageId, elementId);
		applyUpdate(element, request);
		elementRepository.flush();
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public void delete(UUID pageId, UUID elementId) {
		pageService.requirePage(pageId);
		requireActiveElement(pageId, elementId).softDelete();
		elementRepository.flush();
	}

	@Transactional
	public void delete(UUID pageId, UUID elementId, Long userId) {
		pageService.requireWritablePage(pageId, userId);
		requireActiveElement(pageId, elementId).softDelete();
		elementRepository.flush();
	}

	@Transactional
	public CanvasElementResponse restore(UUID pageId, UUID elementId) {
		pageService.requirePage(pageId);
		CanvasElement element = elementRepository.findByElementIdAndPageId(elementId, pageId)
			.orElseThrow(CanvasElementNotFoundException::new);
		if (element.getDeletedAt() == null) { throw new ElementNotDeletedException(); }
		element.restore();
		elementRepository.flush();
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public CanvasElementResponse restore(UUID pageId, UUID elementId, Long userId) {
		pageService.requireWritablePage(pageId, userId);
		CanvasElement element = elementRepository.findByElementIdAndPageId(elementId, pageId)
			.orElseThrow(CanvasElementNotFoundException::new);
		if (element.getDeletedAt() == null) { throw new ElementNotDeletedException(); }
		element.restore();
		elementRepository.flush();
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public CanvasElementListResponse batch(UUID pageId, CanvasElementBatchRequest request) {
		pageService.requirePage(pageId);
		validateBatchIds(request);

		BigDecimal nextSortKey = nextSortKey(pageId);
		for (CanvasElementCreateRequest create : safe(request.creates())) {
			if (create.getElementId() != null && elementRepository.existsById(create.getElementId())) {
				throw new IllegalArgumentException("이미 사용 중인 elementId입니다.");
			}
			elementRepository.save(newElement(pageId, create, nextSortKey));
			nextSortKey = nextSortKey.add(SORT_STEP);
		}
		for (CanvasElementUpdateRequest update : safe(request.updates())) {
			CanvasElement element = requireActiveElement(pageId, update.getElementId());
			applyUpdate(element, update);
		}
		for (UUID elementId : safe(request.deleteElementIds())) {
			requireActiveElement(pageId, elementId).softDelete();
		}
		for (UUID elementId : safe(request.restoreElementIds())) {
			CanvasElement element = elementRepository.findByElementIdAndPageId(elementId, pageId)
				.orElseThrow(CanvasElementNotFoundException::new);
			if (element.getDeletedAt() == null) { throw new ElementNotDeletedException(); }
			element.restore();
		}
		elementRepository.flush();
		return listWithoutPageCheck(pageId);
	}

	@Transactional
	public CanvasElementListResponse batch(UUID pageId, CanvasElementBatchRequest request, Long userId) {
		pageService.requireWritablePage(pageId, userId);
		validateBatchIds(request);

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
		return listWithoutPageCheck(pageId);
	}

	private CanvasElement newElement(UUID pageId, CanvasElementCreateRequest request, BigDecimal sortKey) {
		return new CanvasElement(request.getElementId(), pageId, request.getElementType(), request.getGroupId(),
			request.getName(), sortKey, request.getX(), request.getY(), request.getWidth(), request.getHeight(),
			request.getRotation() == null ? BigDecimal.ZERO : request.getRotation(),
			request.getOpacity() == null ? BigDecimal.ONE : request.getOpacity(),
			Boolean.TRUE.equals(request.getIsLocked()), Boolean.TRUE.equals(request.getIsHidden()), request.getMediaFileId(),
			request.getPropertiesJson() == null ? null : request.getPropertiesJson().toString());
	}

	private CanvasElement newElement(UUID pageId, CanvasElementCreateRequest request, BigDecimal sortKey, Long userId) {
		return new CanvasElement(request.getElementId(), pageId, request.getElementType(), request.getGroupId(),
			request.getName(), sortKey, request.getX(), request.getY(), request.getWidth(), request.getHeight(),
			request.getRotation() == null ? BigDecimal.ZERO : request.getRotation(),
			request.getOpacity() == null ? BigDecimal.ONE : request.getOpacity(),
			Boolean.TRUE.equals(request.getIsLocked()), Boolean.TRUE.equals(request.getIsHidden()), request.getMediaFileId(),
			request.getPropertiesJson() == null ? null : request.getPropertiesJson().toString(), userId);
	}

	private void applyUpdate(CanvasElement element, CanvasElementUpdateRequest request) {
		element.update(request.getGroupId(), request.getName(), request.getSortKey(), request.getX(), request.getY(),
			request.getWidth(), request.getHeight(), request.getRotation(), request.getOpacity(), request.getIsLocked(),
			request.getIsHidden(), request.getMediaFileId(),
			request.getPropertiesJson() == null ? null : request.getPropertiesJson().toString());
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
