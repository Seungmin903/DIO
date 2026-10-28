package com.f106.DIO.page.repository;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import com.f106.DIO.page.domain.DiaryPage;
public interface DiaryPageRepository extends JpaRepository<DiaryPage, UUID> {
	List<DiaryPage> findAllByDiaryIdAndDeletedAtIsNullOrderBySortKeyAscPageIdAsc(UUID diaryId);
	Optional<DiaryPage> findByPageIdAndDeletedAtIsNull(UUID pageId);
	@Query("select max(p.sortKey) from DiaryPage p where p.diaryId = :diaryId and p.deletedAt is null") BigDecimal findMaxSortKeyByDiaryId(UUID diaryId);
}
