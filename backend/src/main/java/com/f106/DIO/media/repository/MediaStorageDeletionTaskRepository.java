package com.f106.DIO.media.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.f106.DIO.media.domain.MediaStorageDeletionTask;

public interface MediaStorageDeletionTaskRepository extends JpaRepository<MediaStorageDeletionTask, UUID> {
	List<MediaStorageDeletionTask> findAllByOrderByQueuedAtAscDeletionIdAsc(Pageable pageable);
}
