package com.f106.DIO.collaboration.repository;
import com.f106.DIO.collaboration.domain.CanvasHistoryOperation;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
public interface CanvasHistoryRepository extends JpaRepository<CanvasHistoryOperation,Long>{
    Optional<CanvasHistoryOperation> findFirstByPageIdAndActorUserIdAndClientOperationId(UUID page,long actor,UUID client);
    Optional<CanvasHistoryOperation> findByOperationIdAndPageIdAndActorUserId(long id,UUID page,long actor);
    Optional<CanvasHistoryOperation> findFirstByPageIdAndActorUserIdAndStatusOrderByOperationIdDesc(UUID page,long actor,String status);
    Optional<CanvasHistoryOperation> findFirstByPageIdAndActorUserIdAndStatusOrderByUndoneAtDescOperationIdAsc(UUID page,long actor,String status);
    List<CanvasHistoryOperation> findByPageIdAndActorUserIdAndSnapshotFormat(UUID page,long actor,String format,Pageable pageable);
    Page<CanvasHistoryOperation> findByPageIdAndActorUserId(UUID page,long actor,Pageable pageable);
    @Modifying @Query("update CanvasHistoryOperation h set h.status='INVALIDATED' where h.pageId=:page and h.actorUserId=:actor and h.status='UNDONE'")
    int invalidateRedo(UUID page,long actor);
}
