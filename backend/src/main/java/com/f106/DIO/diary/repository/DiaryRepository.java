package com.f106.DIO.diary.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import java.time.Instant;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.diary.domain.Diary;

public interface DiaryRepository extends JpaRepository<Diary, UUID> {
	List<Diary> findAllByOwnerUserIdAndDeletedAtIsNullOrderByCreatedAtDescDiaryIdDesc(Long ownerUserId);
	List<Diary> findAllByDiaryIdInAndDeletedAtIsNullOrderByCreatedAtDescDiaryIdDesc(java.util.Collection<UUID> diaryIds);
	Optional<Diary> findByDiaryIdAndDeletedAtIsNull(UUID diaryId);

	@Query("select d.diaryId from Diary d where d.deletedAt <= :cutoff order by d.deletedAt, d.diaryId")
	List<UUID> findExpiredDeletedIds(@Param("cutoff") Instant cutoff, Pageable pageable);

	@Modifying
	@Transactional
	@Query(value = "delete from diaries where diary_id = :diaryId and deleted_at <= :cutoff", nativeQuery = true)
	int deleteExpiredByDiaryId(@Param("diaryId") UUID diaryId, @Param("cutoff") Instant cutoff);
}
