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
import com.f106.DIO.page.support.DuplicateCanvasElementException;
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

	@Transactional
	public CanvasElementResponse update(UUID pageId, UUID elementId, CanvasElementUpdateRequest request) {
		pageService.requirePage(pageId);
		if (request.getElementId() != null && !request.getElementId().equals(elementId)) {
			throw new IllegalArgumentException("본문의 elementId가 경로와 다릅니다.");
		}
		CanvasElement element = applyUpdate(pageId, elementId, request);
		elementRepository.flush();
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	@Transactional
	public void delete(UUID pageId, UUID elementId) {
		pageService.requirePage(pageId);
		requireElement(pageId, elementId).softDelete();
		elementRepository.flush();
	}

	@Transactional
	public CanvasElementResponse restore(UUID pageId, UUID elementId) {
		pageService.requirePage(pageId);
		CanvasElement element = applyRestore(pageId, elementId);
		elementRepository.flush();
		return new CanvasElementResponse(PageMapper.toElementData(element));
	}

	/** creates → updates → deletes → restores 순서로 적용하고, 하나라도 실패하면 전체를 되돌린다. */
	@Transactional
	public CanvasElementListResponse batch(UUID pageId, CanvasElementBatchRequest request) {
		pageService.requirePage(pageId);
		List<CanvasElementCreateRequest> creates = orEmpty(request.creates());
		List<CanvasElementUpdateRequest> updates = orEmpty(request.updates());
		List<UUID> deletes = orEmpty(request.deleteElementIds());
		List<UUID> restores = orEmpty(request.restoreElementIds());
		requireUniqueTargets(creates, updates, deletes, restores);

		BigDecimal maxSortKey = elementRepository.findMaxSortKeyByPageId(pageId);
		List<CanvasElement> created = new ArrayList<>();
		for (CanvasElementCreateRequest create : creates) {
			BigDecimal sortKey = create.getSortKey();
			if (sortKey == null) {
				maxSortKey = maxSortKey == null ? SORT_STEP : maxSortKey.add(SORT_STEP);
				sortKey = maxSortKey;
			}
			created.add(newElement(pageId, create, sortKey));
		}
		elementRepository.saveAll(created);
		updates.forEach(update -> applyUpdate(pageId, update.getElementId(), update));
		deletes.forEach(elementId -> requireElement(pageId, elementId).softDelete());
		restores.forEach(elementId -> applyRestore(pageId, elementId));
		elementRepository.flush();
		return new CanvasElementListResponse(elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId)
			.stream().map(PageMapper::toElementData).toList());
	}

	private CanvasElement newElement(UUID pageId, CanvasElementCreateRequest request, BigDecimal sortKey) {
		if (request.getElementId() != null && elementRepository.existsById(request.getElementId())) {
			throw new DuplicateCanvasElementException();
		}
		return new CanvasElement(request.getElementId(), pageId, request.getElementType(), request.getGroupId(),
			request.getName(), sortKey, request.getX(), request.getY(), request.getWidth(), request.getHeight(),
			request.getRotation() == null ? BigDecimal.ZERO : request.getRotation(),
			request.getOpacity() == null ? BigDecimal.ONE : request.getOpacity(),
			Boolean.TRUE.equals(request.getIsLocked()), Boolean.TRUE.equals(request.getIsHidden()),
			request.getMediaFileId(), PageMapper.toJson(request.getPropertiesJson()));
	}

	private CanvasElement applyUpdate(UUID pageId, UUID elementId, CanvasElementUpdateRequest request) {
		CanvasElement element = requireElement(pageId, elementId);
		element.update(request.getGroupId(), request.getName(), request.getSortKey(), request.getX(), request.getY(),
			request.getWidth(), request.getHeight(), request.getRotation(), request.getOpacity(), request.getIsLocked(),
			request.getIsHidden(), request.getMediaFileId(), PageMapper.toJson(request.getPropertiesJson()));
		return element;
	}

	private CanvasElement applyRestore(UUID pageId, UUID elementId) {
		CanvasElement element = elementRepository.findByElementIdAndPageId(elementId, pageId)
			.orElseThrow(CanvasElementNotFoundException::new);
		if (element.getDeletedAt() == null) {
			throw new ElementNotDeletedException();
		}
		element.restore();
		return element;
	}

	private CanvasElement requireElement(UUID pageId, UUID elementId) {
		return elementRepository.findByElementIdAndPageIdAndDeletedAtIsNull(elementId, pageId)
			.orElseThrow(CanvasElementNotFoundException::new);
	}

	private static void requireUniqueTargets(List<CanvasElementCreateRequest> creates, List<CanvasElementUpdateRequest> updates,
		List<UUID> deletes, List<UUID> restores) {
		Set<UUID> seen = new HashSet<>();
		List<UUID> targets = new ArrayList<>();
		creates.stream().map(CanvasElementCreateRequest::getElementId).filter(id -> id != null).forEach(targets::add);
		for (CanvasElementUpdateRequest update : updates) {
			if (update.getElementId() == null) {
				throw new IllegalArgumentException("updates의 각 항목에는 elementId가 필요합니다.");
			}
			targets.add(update.getElementId());
		}
		targets.addAll(deletes);
		targets.addAll(restores);
		for (UUID target : targets) {
			if (target == null || !seen.add(target)) {
				throw new IllegalArgumentException("한 요청에서 같은 요소를 두 번 이상 변경할 수 없습니다.");
			}
		}
	}

	private static <T> List<T> orEmpty(List<T> values) {
		return values == null ? List.of() : values;
	}
}
