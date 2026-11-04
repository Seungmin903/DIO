package com.f106.DIO.moderation.repository;
import com.f106.DIO.moderation.domain.UserReport;
import java.util.*;import java.time.Instant;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
public interface UserReportRepository extends JpaRepository<UserReport,Long> {
 Optional<UserReport> findByReporterUserIdAndClientRequestId(Long actor,UUID request);
 @Query("select r.reportId from UserReport r where r.notificationStatus <> 'SENT' and r.notificationNextAttemptAt <= :now order by r.notificationNextAttemptAt,r.reportId")
 List<Long> due(Instant now,Pageable page);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select r from UserReport r where r.reportId=:id") Optional<UserReport> lock(Long id);
}
