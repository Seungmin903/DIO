package com.f106.DIO.sharing.repository;
import com.f106.DIO.sharing.domain.DiaryInvite;
import java.time.Instant;
import java.util.*;
import org.springframework.data.jpa.repository.*;
public interface DiaryInviteRepository extends JpaRepository<DiaryInvite,Long> {
    @Query("select i.diaryId from DiaryInvite i where i.inviteId=:id")
    Optional<UUID> diaryId(Long id);
    Optional<DiaryInvite> findFirstByDiaryIdAndInviteTypeAndRevokedAtIsNullOrderByInviteIdDesc(UUID diaryId,String type);
    long countByDiaryIdAndInviteTypeAndCreatedAtAfter(UUID diaryId,String type,Instant since);
    Optional<DiaryInvite> findFirstByDiaryIdAndInviteTypeAndCreatedAtAfterOrderByCreatedAtAsc(UUID diaryId,String type,Instant since);
    /** 만료 판정은 엔티티와 같은 JVM 시각을 쓴다. createdAt 조건은 9999년 만료값이 남은 V28 이전 초대의 7일 상한이다. */
    @Query("select i from DiaryInvite i where i.diaryId=:diary and i.inviteeUserId=:recipient and i.inviteType='EMAIL' and i.revokedAt is null and i.useCount=0 and i.expiresAt>:now and i.createdAt>:createdAfter")
    Optional<DiaryInvite> pendingEmail(UUID diary,Long recipient,Instant now,Instant createdAfter);
    default Optional<DiaryInvite> pendingEmail(UUID diary,Long recipient) {
        Instant now=Instant.now();
        return pendingEmail(diary,recipient,now,now.minusSeconds(com.f106.DIO.sharing.domain.SharingPolicy.EMAIL_INVITE_TTL_SECONDS));
    }
    @Query("select i from DiaryInvite i where i.diaryId=:diary and i.inviteeUserId=:recipient and i.inviteType like 'EMAIL%' and i.createdAt>:since order by i.createdAt,i.inviteId")
    java.util.List<DiaryInvite> recentEmails(UUID diary,Long recipient,Instant since);
    @Query("select i from DiaryInvite i where i.diaryId=:diary and i.inviteType like 'EMAIL%'")
    org.springframework.data.domain.Page<DiaryInvite> sentEmails(UUID diary,org.springframework.data.domain.Pageable page);
    @Query("select i from DiaryInvite i where i.inviteeUserId=:recipient and i.inviteType like 'EMAIL%' and i.inviteType<>'EMAIL_FAILED' and exists (select 1 from Diary d where d.diaryId=i.diaryId and d.deletedAt is null)")
    org.springframework.data.domain.Page<DiaryInvite> receivedEmails(Long recipient,org.springframework.data.domain.Pageable page);
    @Modifying
    @Query("update DiaryInvite i set i.revokedAt=:now where i.diaryId=:diaryId and i.inviteType='LINK' and i.revokedAt is null")
    int revokeLinks(UUID diaryId,Instant now);
    @Query("select i.inviteId from DiaryInvite i where i.inviteType like 'EMAIL%' and i.retentionUntil<=:now order by i.retentionUntil,i.inviteId")
    java.util.List<Long> expiredEmailIds(Instant now,org.springframework.data.domain.Pageable page);
    @Modifying
    @Query("delete from DiaryInvite i where i.inviteId in :ids and i.inviteType like 'EMAIL%' and i.retentionUntil<=:now")
    int deleteExpiredEmails(Collection<Long> ids,Instant now);
}
