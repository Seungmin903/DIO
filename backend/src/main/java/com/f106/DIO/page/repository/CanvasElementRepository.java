package com.f106.DIO.page.repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.f106.DIO.page.domain.CanvasElement;

public interface CanvasElementRepository extends JpaRepository<CanvasElement, UUID> {
	List<CanvasElement> findAllByPageIdAndDeletedAtIsNullOrderBySortKeyAscElementIdAsc(UUID pageId);
	Optional<CanvasElement> findByElementIdAndPageIdAndDeletedAtIsNull(UUID elementId, UUID pageId);
	Optional<CanvasElement> findByElementIdAndPageId(UUID elementId, UUID pageId);

	@Query("select max(e.sortKey) from CanvasElement e where e.pageId = :pageId and e.deletedAt is null")
	BigDecimal findMaxSortKeyByPageId(UUID pageId);
}
