package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaStorageDeletionTask;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.repository.MediaStorageDeletionTaskRepository;

class MediaStorageDeletionQueueServiceTests {
	private final MediaFileRepository mediaFiles = mock(MediaFileRepository.class);
	private final MediaStorageDeletionTaskRepository tasks = mock(MediaStorageDeletionTaskRepository.class);
	private final MediaStorageDeletionQueueService service = new MediaStorageDeletionQueueService(mediaFiles, tasks);

	@Test
	void queuesTheStorageKeyInTheSameOperationAsTheConditionalPhysicalDelete() {
		MediaFile mediaFile = media();
		Instant cutoff = Instant.parse("2026-10-28T00:00:00Z");
		when(mediaFiles.deletePhysicallyIfDeletable(mediaFile.getMediaFileId(), cutoff)).thenReturn(1);
		when(tasks.save(any(MediaStorageDeletionTask.class))).thenAnswer(call -> call.getArgument(0));

		MediaStorageDeletionTask task = service.enqueueAfterPhysicalDelete(mediaFile, cutoff);

		assertThat(task.getMediaFileId()).isEqualTo(mediaFile.getMediaFileId());
		assertThat(task.getStorageKey()).isEqualTo(mediaFile.getStorageKey());
		var order = inOrder(mediaFiles, tasks);
		order.verify(mediaFiles).deletePhysicallyIfDeletable(mediaFile.getMediaFileId(), cutoff);
		order.verify(tasks).save(any(MediaStorageDeletionTask.class));
	}

	@Test
	void doesNotQueueStorageDeletionWhenAReferenceAppearsBeforeTheConditionalDelete() {
		MediaFile mediaFile = media();
		Instant cutoff = Instant.parse("2026-10-28T00:00:00Z");
		when(mediaFiles.deletePhysicallyIfDeletable(mediaFile.getMediaFileId(), cutoff)).thenReturn(0);

		assertThat(service.enqueueAfterPhysicalDelete(mediaFile, cutoff)).isNull();

		verify(tasks, never()).save(any());
	}

	@Test
	void recordsTheFailureCountOnTheQueuedTask() {
		MediaStorageDeletionTask task = new MediaStorageDeletionTask(UUID.randomUUID(), "media/image/2026/10/test.png");
		when(tasks.findById(task.getDeletionId())).thenReturn(Optional.of(task));

		service.recordFailure(task, new IllegalStateException("S3 unavailable"));

		assertThat(task.getAttemptCount()).isEqualTo(1);
		assertThat(task.getLastAttemptAt()).isNotNull();
		assertThat(task.getLastError()).isEqualTo("IllegalStateException");
	}

	private static MediaFile media() {
		UUID id = UUID.randomUUID();
		return new MediaFile(id, 1L, MediaType.IMAGE, MediaLibraryCategory.PHOTO,
			"media/image/2026/10/" + id + ".png", "photo.png", "image/png", 1, "0".repeat(64));
	}
}
