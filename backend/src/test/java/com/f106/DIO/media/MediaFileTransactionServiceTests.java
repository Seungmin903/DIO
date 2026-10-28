package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.inOrder;

import java.util.Optional;
import java.util.List;
import java.util.UUID;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.repository.MediaStorageDeletionTaskRepository;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.service.MediaFileTransactionService;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.support.MediaFileNotFoundException;
import com.f106.DIO.media.support.MediaRequestException;

class MediaFileTransactionServiceTests {
	private final MediaFileRepository mediaFiles = mock(MediaFileRepository.class);
	private final MediaStorageDeletionTaskRepository deletionTasks = mock(MediaStorageDeletionTaskRepository.class);
	private final MediaFileTransactionService service = new MediaFileTransactionService(mediaFiles, deletionTasks);

	@Test
	void removesTheUploadCleanupTaskWithTheSuccessfulMediaPersistence() {
		MediaFile mediaFile = media(2L);
		UUID cleanupTaskId = UUID.randomUUID();

		service.persist(mediaFile, cleanupTaskId);

		var order = inOrder(mediaFiles, deletionTasks);
		order.verify(mediaFiles).save(mediaFile);
		order.verify(deletionTasks).deleteById(cleanupTaskId);
	}

	@Test
	void rejectsAnotherUsersMediaAsNotFound() {
		UUID mediaFileId = UUID.randomUUID();
		when(mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, 2L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.storageReference(mediaFileId, 2L)).isInstanceOf(MediaFileNotFoundException.class);
	}

	@Test
	void limitsTheLibraryAndProvidesACursorForTheNextPage() {
		MediaFile first = media(2L);
		MediaFile second = media(2L);
		when(mediaFiles.findFirstActivePage(eq(2L), any())).thenReturn(List.of(first, second));

		var response = service.list(2L, 1, null);

		assertThat(response.mediaFiles()).hasSize(1);
		assertThat(response.nextCursor()).isNotBlank();
	}

	@Test
	void rejectsAnOutOfRangePageLimit() {
		assertThatThrownBy(() -> service.list(2L, 101, null)).isInstanceOf(MediaRequestException.class);
	}

	@Test
	void rejectsATamperedCursorAsABadRequest() {
		String invalidCursor = Base64.getUrlEncoder().withoutPadding().encodeToString("not-a-time|".concat(UUID.randomUUID().toString()).getBytes(StandardCharsets.UTF_8));

		assertThatThrownBy(() -> service.list(2L, 30, invalidCursor)).isInstanceOf(MediaRequestException.class);
	}

	private static MediaFile media(Long ownerUserId) {
		UUID id = UUID.randomUUID();
		return new MediaFile(id, ownerUserId, MediaType.IMAGE, MediaLibraryCategory.PHOTO,
			"media/image/2026/10/" + id + ".png", "photo.png", "image/png", 1, "0".repeat(64));
	}
}
