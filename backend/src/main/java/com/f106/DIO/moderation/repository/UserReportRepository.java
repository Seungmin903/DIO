package com.f106.DIO.moderation.repository;
import com.f106.DIO.moderation.domain.UserReport;
import java.util.*;import java.time.Instant;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
public interface UserReportRepository extends JpaRepository<UserReport,Long> {
 Optional<UserReport> findByReporterUserIdAndClientRequestId(Long actor,UUID request);
 @Query("select r.createdAt from UserReport r where r.reporterUserId=:actor and r.createdAt>:since order by r.createdAt desc")
 List<Instant> recentByActor(long actor,Instant since,Pageable page);
 @Query("select r.createdAt from UserReport r where r.reporterUserId=:actor and r.reportedUserId=:target and r.createdAt>:since order by r.createdAt desc")
 List<Instant> recentByTarget(long actor,long target,Instant since,Pageable page);
 @Query("select r.reportId from UserReport r where r.notificationStatus <> 'SENT' and r.notificationNextAttemptAt <= :now order by r.notificationNextAttemptAt,r.reportId")
 List<Long> due(Instant now,Pageable page);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select r from UserReport r where r.status in ('RESOLVED','DISMISSED') and r.retentionHold = false and r.resolvedAt <= :cutoff order by r.resolvedAt,r.reportId")
 List<UserReport> retentionExpired(Instant cutoff,Pageable page);
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 @Query("select r from UserReport r where r.status in ('RESOLVED','DISMISSED') and r.retentionHold = false and r.resolvedAt <= :cutoff and (r.resolvedAt > :afterTime or (r.resolvedAt = :afterTime and r.reportId > :afterId)) order by r.resolvedAt,r.reportId")
 List<UserReport> retentionExpiredAfter(Instant cutoff,Instant afterTime,Long afterId,Pageable page);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select r from UserReport r where r.reportId=:id") Optional<UserReport> lock(Long id);
}
