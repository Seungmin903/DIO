package com.f106.DIO.page.service;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.diary.support.DiaryNotFoundException;
import com.f106.DIO.page.domain.CanvasElement;
import com.f106.DIO.page.domain.DiaryPage;
import com.f106.DIO.page.domain.PageTemplate;
import com.f106.DIO.page.dto.PageCreateRequest;
import com.f106.DIO.page.dto.PageDetailResponse;
import com.f106.DIO.page.dto.PageListResponse;
import com.f106.DIO.page.dto.PageOrderRequest;
import com.f106.DIO.page.dto.PageResponse;
import com.f106.DIO.page.dto.PageUpdateRequest;
import com.f106.DIO.page.repository.CanvasElementRepository;
import com.f106.DIO.page.repository.DiaryPageRepository;
import com.f106.DIO.page.repository.PageTemplateRepository;
import com.f106.DIO.page.support.PageNotFoundException;
import com.f106.DIO.page.support.PageTemplateNotFoundException;

@Service
public class PageService {

	private static final BigDecimal DEFAULT_CANVAS_WIDTH = new BigDecimal("1280.00");
	private static final BigDecimal DEFAULT_CANVAS_HEIGHT = new BigDecimal("800.00");
	private static final BigDecimal SORT_STEP = BigDecimal.ONE;

	private final DiaryRepository diaryRepository;
	private final DiaryPageRepository pageRepository;
	private final PageTemplateRepository pageTemplateRepository;
	private final CanvasElementRepository elementRepository;

	public PageService(DiaryRepository diaryRepository, DiaryPageRepository pageRepository,
		PageTemplateRepository pageTemplateRepository, CanvasElementRepository elementRepository) {
		this.diaryRepository = diaryRepository;
		this.pageRepository = pageRepository;
		this.pageTemplateRepository = pageTemplateRepository;
		this.elementRepository = elementRepository;
	}

	@Transactional(readOnly = true)
	public PageListResponse list(UUID diaryId) {
		requireDiary(diaryId);
		return new PageListResponse(pageRepository.findAllByDiaryIdAndDeletedAtIsNullOrderBySortKeyAscPageIdAsc(diaryId)
			.stream().map(PageMapper::toPageData).toList());
	}

	@Transactional
	public PageResponse create(UUID diaryId, PageCreateRequest request) {
		requireDiary(diaryId);
		PageTemplate template = findTemplate(request.getTemplateId());
		DiaryPage page = new DiaryPage(diaryId, request.getTemplateId(),
			request.getTemplateConfig() == null ? defaultConfig(template) : PageMapper.toJson(request.getTemplateConfig()),
			request.getTitle(), nextPageSortKey(diaryId),
			request.getCanvasWidth() == null ? canvasWidth(template) : request.getCanvasWidth(),
			request.getCanvasHeight() == null ? canvasHeight(template) : request.getCanvasHeight(),
			Boolean.TRUE.equals(request.getGridVisible()), request.getGridColor());
		pageRepository.saveAndFlush(page);
		return new PageResponse(PageMapper.toPageData(page));
	}

	@Transactional(readOnly = true)
	public PageDetailResponse detail(UUID pageId) {
		DiaryPage page = requirePage(pageId);
		return new PageDetailResponse(PageMapper.toPageData(page),
			elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId)
				.stream().map(PageMapper::toElementData).toList());
	}

	@Transactional
	public PageResponse update(UUID pageId, PageUpdateRequest request) {
		DiaryPage page = requirePage(pageId);
		PageTemplate template = findTemplate(request.getTemplateId());
		BigDecimal width = request.getCanvasWidth();
		BigDecimal height = request.getCanvasHeight();
		if (template != null && width == null) {
			width = template.getCanvasWidth();
			height = template.getCanvasHeight();
		}
		page.updateSettings(request.getTemplateId(), PageMapper.toJson(request.getTemplateConfig()), request.getTitle(), width, height,
			request.getGridVisible(), request.getGridColor());
		pageRepository.flush();
		return new PageResponse(PageMapper.toPageData(page));
	}

	@Transactional
	public PageResponse copy(UUID pageId) {
		DiaryPage source = requirePage(pageId);
		DiaryPage copied = new DiaryPage(source.getDiaryId(), source.getTemplateId(), source.getTemplateConfig(),
			source.getTitle(), nextPageSortKey(source.getDiaryId()), source.getCanvasWidth(), source.getCanvasHeight(),
			source.isGridVisible(), source.getGridColor());
		pageRepository.saveAndFlush(copied);
		List<CanvasElement> copies = elementRepository.findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(pageId)
			.stream().map(element -> element.copyFor(copied.getPageId(), element.getSortKey())).toList();
		elementRepository.saveAll(copies);
		elementRepository.flush();
		return new PageResponse(PageMapper.toPageData(copied));
	}

	@Transactional
	public PageListResponse reorder(UUID diaryId, PageOrderRequest request) {
		requireDiary(diaryId);
		Map<UUID, DiaryPage> pages = pageRepository.findAllByDiaryIdAndDeletedAtIsNullOrderBySortKeyAscPageIdAsc(diaryId)
			.stream().collect(Collectors.toMap(DiaryPage::getPageId, Function.identity()));
		Set<UUID> received = new HashSet<>(request.pageIds());
		if (received.size() != request.pageIds().size() || !received.equals(pages.keySet())) {
			throw new IllegalArgumentException("현재 다이어리의 삭제되지 않은 페이지 ID를 중복 없이 모두 전달해야 합니다.");
		}
		for (int index = 0; index < request.pageIds().size(); index++) {
			pages.get(request.pageIds().get(index)).reorder(BigDecimal.valueOf(index + 1L));
		}
		pageRepository.flush();
		return listWithoutDiaryCheck(diaryId);
	}

	@Transactional
	public void delete(UUID pageId) {
		DiaryPage page = requirePage(pageId);
		page.softDelete();
		pageRepository.flush();
	}

	@Transactional(readOnly = true)
	public DiaryPage requirePage(UUID pageId) {
		return pageRepository.findByPageIdAndDeletedAtIsNull(pageId).orElseThrow(PageNotFoundException::new);
	}

	private void requireDiary(UUID diaryId) {
		diaryRepository.findByDiaryIdAndDeletedAtIsNull(diaryId).orElseThrow(DiaryNotFoundException::new);
	}

	private PageTemplate findTemplate(Long templateId) {
		return templateId == null ? null : pageTemplateRepository.findByTemplateIdAndIsActiveTrue(templateId)
			.orElseThrow(PageTemplateNotFoundException::new);
	}

	private BigDecimal nextPageSortKey(UUID diaryId) {
		BigDecimal max = pageRepository.findMaxSortKeyByDiaryId(diaryId);
		return max == null ? SORT_STEP : max.add(SORT_STEP);
	}

	private PageListResponse listWithoutDiaryCheck(UUID diaryId) {
		return new PageListResponse(pageRepository.findAllByDiaryIdAndDeletedAtIsNullOrderBySortKeyAscPageIdAsc(diaryId)
			.stream().map(PageMapper::toPageData).toList());
	}

	private static BigDecimal canvasWidth(PageTemplate template) {
		return template == null ? DEFAULT_CANVAS_WIDTH : template.getCanvasWidth();
	}

	private static BigDecimal canvasHeight(PageTemplate template) {
		return template == null ? DEFAULT_CANVAS_HEIGHT : template.getCanvasHeight();
	}

	private static String defaultConfig(PageTemplate template) {
		return template == null ? null : template.getDefaultConfig();
	}
}
