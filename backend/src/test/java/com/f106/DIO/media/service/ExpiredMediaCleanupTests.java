package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaStorageDeletionTask;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.storage.MediaFiles;

class ExpiredMediaCleanupTests {
	private final MediaFileRepository mediaFiles = mock(MediaFileRepository.class);
	private final MediaStorageDeletionQueueService deletionQueue = mock(MediaStorageDeletionQueueService.class);
	private final MediaFiles files = mock(MediaFiles.class);
	private final GuardedMediaOperations guarded = mock(GuardedMediaOperations.class);
	private ExpiredMediaCleanup cleanup;

	@BeforeEach
	void setUp() {
		cleanup = new ExpiredMediaCleanup(mediaFiles, deletionQueue, files, guarded, Duration.ofDays(1), 100);
		when(deletionQueue.next(anyInt())).thenReturn(List.of());
		when(guarded.deleteIfUnlocked(any())).thenReturn(true);
	}

	@Test
	void excessiveConfiguredBatchSizeIsCappedAtOneHundred() {
		var capped = new ExpiredMediaCleanup(mediaFiles, deletionQueue, files, guarded, Duration.ofDays(1), 100000);
		when(mediaFiles.findPhysicallyDeletable(any(), any(Pageable.class))).thenReturn(List.of());
		capped.purgeExpiredAt(Instant.now());
		var page = org.mockito.ArgumentCaptor.forClass(Pageable.class);
		verify(mediaFiles).findPhysicallyDeletable(any(), page.capture());
		assertThat(page.getValue().getPageSize()).isEqualTo(100);
	}

	@Test
	void removesTheExpiredUnreferencedStorageObjectAndDatabaseRow() {
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		Instant cutoff = now.minus(Duration.ofDays(1));
		MediaFile mediaFile = media();
		when(mediaFiles.findPhysicallyDeletable(eq(cutoff), any(Pageable.class))).thenReturn(List.of(mediaFile));
		MediaStorageDeletionTask task = task(mediaFile);
		when(deletionQueue.enqueueAfterPhysicalDelete(mediaFile, cutoff)).thenReturn(task);

		assertThat(cleanup.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(1, 0));

		var order = inOrder(deletionQueue, guarded);
		order.verify(deletionQueue).enqueueAfterPhysicalDelete(mediaFile, cutoff);
		order.verify(guarded).deleteIfUnlocked(task.getDeletionId());
	}

	@Test
	void keepsAQueuedTaskForRetryWhenStorageDeletionFails() {
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		Instant cutoff = now.minus(Duration.ofDays(1));
		MediaFile mediaFile = media();
		when(mediaFiles.findPhysicallyDeletable(eq(cutoff), any(Pageable.class))).thenReturn(List.of(mediaFile));
		MediaStorageDeletionTask task = task(mediaFile);
		when(deletionQueue.enqueueAfterPhysicalDelete(mediaFile, cutoff)).thenReturn(task);
		when(guarded.deleteIfUnlocked(task.getDeletionId())).thenThrow(new IllegalStateException("S3 unavailable"));

		assertThat(cleanup.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(0, 1));

		verify(deletionQueue).recordFailure(eq(task), any());
	}

	@Test
	void doesNotDeleteStorageWhenAReferenceAppearsBeforeConditionalDatabaseDelete() {
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		Instant cutoff = now.minus(Duration.ofDays(1));
		MediaFile mediaFile = media();
		when(mediaFiles.findPhysicallyDeletable(eq(cutoff), any(Pageable.class))).thenReturn(List.of(mediaFile));
		when(deletionQueue.enqueueAfterPhysicalDelete(mediaFile, cutoff)).thenReturn(null);

		assertThat(cleanup.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(0, 0));

		verify(guarded, never()).deleteIfUnlocked(any());
	}

	@Test
	void rowsThatKeepFailingDoNotBlockLaterCandidates() {
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		Instant cutoff = now.minus(Duration.ofDays(1));
		ExpiredMediaCleanup smallBatch = new ExpiredMediaCleanup(mediaFiles, deletionQueue, files, guarded, Duration.ofDays(1), 2);
		MediaFile broken1 = media(), broken2 = media(), healthy = media();
		when(mediaFiles.findPhysicallyDeletable(eq(cutoff), any(Pageable.class))).thenReturn(List.of(broken1, broken2));
		when(mediaFiles.findPhysicallyDeletableAfter(eq(cutoff), any(), eq(broken2.getMediaFileId()), any(Pageable.class)))
			.thenReturn(List.of(healthy));
		doThrow(new IllegalStateException("fk violation")).when(deletionQueue).enqueueAfterPhysicalDelete(broken1, cutoff);
		doThrow(new IllegalStateException("fk violation")).when(deletionQueue).enqueueAfterPhysicalDelete(broken2, cutoff);
		when(deletionQueue.enqueueAfterPhysicalDelete(healthy, cutoff)).thenReturn(task(healthy));

		assertThat(smallBatch.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(1, 2));

		verify(guarded).deleteIfUnlocked(any());
	}

	@Test
	void stopsAfterDeletingOneBatchOfRows() {
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		Instant cutoff = now.minus(Duration.ofDays(1));
		ExpiredMediaCleanup smallBatch = new ExpiredMediaCleanup(mediaFiles, deletionQueue, files, guarded, Duration.ofDays(1), 2);
		MediaFile first = media(), second = media();
		when(mediaFiles.findPhysicallyDeletable(eq(cutoff), any(Pageable.class))).thenReturn(List.of(first, second));
		when(deletionQueue.enqueueAfterPhysicalDelete(eq(first), eq(cutoff))).thenReturn(task(first));
		when(deletionQueue.enqueueAfterPhysicalDelete(eq(second), eq(cutoff))).thenReturn(task(second));

		assertThat(smallBatch.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(2, 0));

		verify(mediaFiles, never()).findPhysicallyDeletableAfter(any(), any(), any(), any());
	}

	@Test
	void retriesAQueuedStorageDeleteBeforeLookingForNewExpiredRows() {
		MediaFile mediaFile = media();
		MediaStorageDeletionTask task = task(mediaFile);
		ExpiredMediaCleanup smallBatch = new ExpiredMediaCleanup(mediaFiles, deletionQueue, files, guarded, Duration.ofDays(1), 1);
		when(deletionQueue.next(1)).thenReturn(List.of(task));

		assertThat(smallBatch.purgeExpiredAt(Instant.parse("2026-10-28T00:00:00Z"))).isEqualTo(new ExpiredMediaCleanup.Result(1, 0));

		verify(guarded).deleteIfUnlocked(task.getDeletionId());
		verify(mediaFiles, never()).findPhysicallyDeletable(any(), any());
	}

	@Test
	void reservesHalfOfTheBatchForNewExpiredMediaWhenRetriesAreDue() {
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		Instant cutoff = now.minus(Duration.ofDays(1));
		ExpiredMediaCleanup smallBatch = new ExpiredMediaCleanup(mediaFiles, deletionQueue, files, guarded, Duration.ofDays(1), 4);
		MediaStorageDeletionTask queuedFirst = task(media()), queuedSecond = task(media());
		MediaFile first = media(), second = media();
		when(deletionQueue.next(2)).thenReturn(List.of(queuedFirst, queuedSecond));
		when(mediaFiles.findPhysicallyDeletable(eq(cutoff), any(Pageable.class))).thenReturn(List.of(first, second));
		when(deletionQueue.enqueueAfterPhysicalDelete(eq(first), eq(cutoff))).thenReturn(task(first));
		when(deletionQueue.enqueueAfterPhysicalDelete(eq(second), eq(cutoff))).thenReturn(task(second));

		assertThat(smallBatch.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(4, 0));

		verify(mediaFiles).findPhysicallyDeletable(eq(cutoff), any(Pageable.class));
	}

	@Test
	void lockedTaskIsSkippedWithoutFailureAndRetriedAfterUnlock() {
		MediaStorageDeletionTask locked = task(media()), available = task(media());
		ExpiredMediaCleanup smallBatch = new ExpiredMediaCleanup(mediaFiles, deletionQueue, files, guarded, Duration.ofDays(1), 4);
		when(deletionQueue.next(2)).thenReturn(List.of(locked, available), List.of(locked));
		when(guarded.deleteIfUnlocked(locked.getDeletionId())).thenReturn(false, true);
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		assertThat(smallBatch.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(1, 0));
		verify(deletionQueue, never()).recordFailure(eq(locked), any());
		assertThat(smallBatch.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(1, 0));
		verify(guarded, org.mockito.Mockito.times(2)).deleteIfUnlocked(locked.getDeletionId());
		verify(guarded).deleteIfUnlocked(available.getDeletionId());
	}

	@Test
	void taskLockedAfterSelectionIsSkippedAndRetriedOnNextRun() {
		MediaStorageDeletionTask locked = task(media());
		ExpiredMediaCleanup smallBatch = new ExpiredMediaCleanup(mediaFiles, deletionQueue, files, guarded, Duration.ofDays(1), 2);
		when(deletionQueue.next(1)).thenReturn(List.of(locked));
		when(guarded.deleteIfUnlocked(locked.getDeletionId())).thenReturn(false, true);
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		assertThat(smallBatch.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(0, 0));
		assertThat(smallBatch.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(1, 0));
		verify(deletionQueue, org.mockito.Mockito.times(2)).next(1);
		verify(guarded, org.mockito.Mockito.times(2)).deleteIfUnlocked(locked.getDeletionId());
	}

	private static MediaFile media() {
		UUID id = UUID.randomUUID();
		return new MediaFile(id, 1L, MediaType.IMAGE, MediaLibraryCategory.PHOTO,
			"media/image/2026/10/" + id + ".png", "photo.png", "image/png", 1, "0".repeat(64));
	}

	private static MediaStorageDeletionTask task(MediaFile mediaFile) {
		return new MediaStorageDeletionTask(mediaFile.getMediaFileId(), mediaFile.getStorageKey());
	}
}
