package com.f106.DIO.diary.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;

public interface DiaryMemberRepository extends JpaRepository<DiaryMember, DiaryMemberId> {
    @org.springframework.data.jpa.repository.Query("select m.diaryId from DiaryMember m where m.userId=:userId and m.leftAt is null")
    java.util.List<java.util.UUID> activeDiaryIdsByUserId(@org.springframework.data.repository.query.Param("userId") long userId);
	Optional<DiaryMember> findByDiaryIdAndUserIdAndLeftAtIsNull(UUID diaryId, Long userId);
	List<DiaryMember> findAllByUserIdAndLeftAtIsNull(Long userId);
    List<DiaryMember> findByDiaryIdAndLeftAtIsNullOrderByJoinedAtAscUserIdAsc(UUID diaryId);
    long countByDiaryIdAndLeftAtIsNull(UUID diaryId);
}
