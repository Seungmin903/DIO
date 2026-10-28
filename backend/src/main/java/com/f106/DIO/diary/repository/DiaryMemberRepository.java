package com.f106.DIO.diary.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;

public interface DiaryMemberRepository extends JpaRepository<DiaryMember, DiaryMemberId> {
	Optional<DiaryMember> findByDiaryIdAndUserIdAndLeftAtIsNull(UUID diaryId, Long userId);
	List<DiaryMember> findAllByUserIdAndLeftAtIsNull(Long userId);
}
