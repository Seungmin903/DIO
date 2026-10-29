package com.f106.DIO.page.repository;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.data.jpa.repository.*;
import com.f106.DIO.page.domain.DiaryPage;
public interface DiaryPageRepository extends JpaRepository<DiaryPage, UUID> {
    List<DiaryPage> findAllByDiaryIdOrderByCreatedAtAscPageIdAsc(UUID diaryId);
    // Portable prefilter: hydrate only request-ID candidates, then verify the exact JSON field.
    // Includes deleted pages so a retry can never resurrect an already deleted request.
    @Query(value="select * from pages where diary_id=:diaryId and cast(template_config as varchar) like concat('%',:requestId,'%')",nativeQuery=true)
    List<DiaryPage> findCreationRequestCandidates(UUID diaryId,String requestId);
	List<DiaryPage> findAllByDiaryIdAndDeletedAtIsNullOrderBySortKeyAscPageIdAsc(UUID diaryId);
	Optional<DiaryPage> findByPageIdAndDeletedAtIsNull(UUID pageId);
	@Query("select max(p.sortKey) from DiaryPage p where p.diaryId = :diaryId and p.deletedAt is null") BigDecimal findMaxSortKeyByDiaryId(UUID diaryId);
}
