package com.f106.DIO.media.repository;

import java.util.List;
import java.time.Instant;
import java.util.UUID;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

import com.f106.DIO.media.domain.MediaStorageDeletionTask;

public interface MediaStorageDeletionTaskRepository extends JpaRepository<MediaStorageDeletionTask, UUID> {
	String FIND_DUE_UNLOCKED = "select * from media_storage_deletion_queue where next_attempt_at <= :now order by next_attempt_at, deletion_id limit :limit for update skip locked";
	@Query(value = FIND_DUE_UNLOCKED, nativeQuery = true)
	List<MediaStorageDeletionTask> findDueUnlocked(@Param("now") Instant now, @Param("limit") int limit);
}
