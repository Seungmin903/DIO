package com.f106.DIO.moderation.repository;
import com.f106.DIO.moderation.domain.ReportEvidenceDeletionTask;import java.time.Instant;import java.util.*;
import org.springframework.data.jpa.repository.*;import org.springframework.data.repository.query.Param;
public interface ReportEvidenceDeletionTaskRepository extends JpaRepository<ReportEvidenceDeletionTask,UUID> {
 @Query(value="select * from report_evidence_deletion_queue where next_attempt_at <= :now order by next_attempt_at,deletion_id limit :limit for update skip locked",nativeQuery=true)
 List<ReportEvidenceDeletionTask> findDueUnlocked(@Param("now") Instant now,@Param("limit") int limit);
}
