package com.f106.DIO.diary.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import com.f106.DIO.diary.domain.Diary;

public interface DiaryRepository extends JpaRepository<Diary, UUID> {
	@org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
	@org.springframework.data.jpa.repository.Query("select d from Diary d where d.diaryId = :diaryId and d.deletedAt is null")
	Optional<Diary> findForUpdate(UUID diaryId);
	List<Diary> findAllByDeletedAtIsNullOrderByCreatedAtDescDiaryIdDesc();
	Optional<Diary> findByDiaryIdAndDeletedAtIsNull(UUID diaryId);
}
