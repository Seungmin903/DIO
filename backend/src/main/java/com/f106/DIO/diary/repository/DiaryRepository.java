package com.f106.DIO.diary.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import com.f106.DIO.diary.domain.Diary;

public interface DiaryRepository extends JpaRepository<Diary, Long> {
	List<Diary> findAllByOrderByCreatedAtDescDiaryIdDesc();
}
