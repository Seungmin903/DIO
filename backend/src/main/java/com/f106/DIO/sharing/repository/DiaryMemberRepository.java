package com.f106.DIO.sharing.repository;
import com.f106.DIO.sharing.domain.*;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
public interface DiaryMemberRepository extends JpaRepository<DiaryMember,DiaryMemberId> {
    List<DiaryMember> findByDiaryIdAndLeftAtIsNullOrderByJoinedAtAscUserIdAsc(UUID diaryId);
    long countByDiaryIdAndLeftAtIsNull(UUID diaryId);
}
