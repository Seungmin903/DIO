package com.ssafy.dio.diary.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import com.ssafy.dio.diary.domain.Diary;

public interface DiaryRepository extends JpaRepository<Diary, Long> {
	List<Diary> findAllByOrderByCreatedAtDescDiaryIdDesc();
}
