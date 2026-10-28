package com.f106.DIO.media.service;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaStorageDeletionTask;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.repository.MediaStorageDeletionTaskRepository;

/** 조건부 DB 삭제와 저장소 삭제 대기 등록을 같은 트랜잭션으로 보장한다. */
@Service
public class MediaStorageDeletionQueueService {
	private final MediaFileRepository mediaFiles;
	private final MediaStorageDeletionTaskRepository tasks;

	public MediaStorageDeletionQueueService(MediaFileRepository mediaFiles, MediaStorageDeletionTaskRepository tasks) {
		this.mediaFiles = mediaFiles;
		this.tasks = tasks;
	}

	@Transactional
	public MediaStorageDeletionTask enqueueAfterPhysicalDelete(MediaFile mediaFile, Instant cutoff) {
		if (mediaFiles.deletePhysicallyIfDeletable(mediaFile.getMediaFileId(), cutoff) != 1) return null;
		return tasks.save(new MediaStorageDeletionTask(mediaFile.getMediaFileId(), mediaFile.getStorageKey()));
	}

	@Transactional(readOnly = true)
	public List<MediaStorageDeletionTask> next(int limit) {
		return tasks.findAllByOrderByQueuedAtAscDeletionIdAsc(PageRequest.of(0, limit));
	}

	@Transactional
	public void complete(MediaStorageDeletionTask task) {
		tasks.deleteById(task.getDeletionId());
	}

	@Transactional
	public void recordFailure(MediaStorageDeletionTask task, RuntimeException error) {
		tasks.findById(task.getDeletionId()).ifPresent(current -> current.recordFailure(error.getClass().getSimpleName()));
	}
}
