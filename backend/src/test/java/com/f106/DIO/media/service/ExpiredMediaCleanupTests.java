package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.storage.MediaFiles;

class ExpiredMediaCleanupTests {
	private final MediaFileRepository mediaFiles = mock(MediaFileRepository.class);
	private final MediaFiles files = mock(MediaFiles.class);
	private final ExpiredMediaCleanup cleanup = new ExpiredMediaCleanup(mediaFiles, files, Duration.ofDays(1), 100);

	@Test
	void removesTheExpiredUnreferencedStorageObjectAndDatabaseRow() {
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		Instant cutoff = now.minus(Duration.ofDays(1));
		MediaFile mediaFile = media();
		when(mediaFiles.findPhysicallyDeletable(eq(cutoff), any(Pageable.class))).thenReturn(List.of(mediaFile));
		when(mediaFiles.deletePhysicallyIfDeletable(mediaFile.getMediaFileId(), cutoff)).thenReturn(1);

		assertThat(cleanup.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(1, 0));

		verify(files).delete(mediaFile.getStorageKey());
		verify(mediaFiles).deletePhysicallyIfDeletable(mediaFile.getMediaFileId(), cutoff);
	}

	@Test
	void leavesTheDatabaseRowForRetryWhenStorageDeletionFails() {
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		Instant cutoff = now.minus(Duration.ofDays(1));
		MediaFile mediaFile = media();
		when(mediaFiles.findPhysicallyDeletable(eq(cutoff), any(Pageable.class))).thenReturn(List.of(mediaFile));
		doThrow(new IllegalStateException("S3 unavailable")).when(files).delete(mediaFile.getStorageKey());

		assertThat(cleanup.purgeExpiredAt(now)).isEqualTo(new ExpiredMediaCleanup.Result(0, 1));

		verify(mediaFiles, never()).deletePhysicallyIfDeletable(mediaFile.getMediaFileId(), cutoff);
	}

	private static MediaFile media() {
		UUID id = UUID.randomUUID();
		return new MediaFile(id, 1L, MediaType.IMAGE, MediaLibraryCategory.PHOTO,
			"media/image/2026/10/" + id + ".png", "photo.png", "image/png", 1, "0".repeat(64));
	}
}
