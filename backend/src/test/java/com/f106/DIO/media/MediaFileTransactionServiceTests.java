package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.service.MediaFileTransactionService;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.support.MediaFileNotFoundException;

class MediaFileTransactionServiceTests {
	private final MediaFileRepository mediaFiles = mock(MediaFileRepository.class);
	private final MediaFileTransactionService service = new MediaFileTransactionService(mediaFiles, mock(MediaFiles.class));

	@Test
	void rejectsAnotherUsersMediaAsNotFound() {
		UUID mediaFileId = UUID.randomUUID();
		when(mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, 2L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.storageReference(mediaFileId, 2L)).isInstanceOf(MediaFileNotFoundException.class);
	}
}
