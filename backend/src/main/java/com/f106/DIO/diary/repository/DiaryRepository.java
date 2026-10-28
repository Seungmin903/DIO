package com.f106.DIO.diary.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import com.f106.DIO.diary.domain.Diary;

public interface DiaryRepository extends JpaRepository<Diary, UUID> {
	List<Diary> findAllByDeletedAtIsNullOrderByCreatedAtDescDiaryIdDesc();
	Optional<Diary> findByDiaryIdAndDeletedAtIsNull(UUID diaryId);
}
