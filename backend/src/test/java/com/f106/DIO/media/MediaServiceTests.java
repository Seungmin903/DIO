package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.service.MediaService;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.support.MediaRequestException;

class MediaServiceTests {
	private final MediaFileRepository mediaFiles = mock(MediaFileRepository.class);
	private final MediaFiles storage = mock(MediaFiles.class);
	private final MediaService service = new MediaService(mediaFiles, storage);

	@Test
	void gifIsStoredAsImageAndKeepsGifMimeType() {
		MockMultipartFile file = new MockMultipartFile("file", "animated.gif", "image/gif", "GIF89a".getBytes());
		when(mediaFiles.save(any(MediaFile.class))).thenAnswer(invocation -> invocation.getArgument(0));

		var response = service.upload(file, "STICKER", 7L);

		assertThat(response.mediaType()).isEqualTo("IMAGE");
		assertThat(response.libraryCategory()).isEqualTo("STICKER");
		assertThat(response.mimeType()).isEqualTo("image/gif");
		assertThat(response.checksumSha256()).hasSize(64);
		verify(storage).put(startsWith("media/image/"), any(), eq("image/gif"));
	}

	@Test
	void wavIsStoredAsAudioWithAudioCategoryByDefault() {
		byte[] wav = new byte[] {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'A', 'V', 'E'};
		when(mediaFiles.save(any(MediaFile.class))).thenAnswer(invocation -> invocation.getArgument(0));

		var response = service.upload(new MockMultipartFile("file", "memo.wav", "audio/wav", wav), null, 7L);

		assertThat(response.mediaType()).isEqualTo("AUDIO");
		assertThat(response.libraryCategory()).isEqualTo("AUDIO");
		assertThat(response.mimeType()).isEqualTo("audio/wav");
	}

	@Test
	void rejectsAudioInAnImageCategory() {
		byte[] wav = new byte[] {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'A', 'V', 'E'};

		assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "memo.wav", "audio/wav", wav), "PHOTO", 7L))
			.isInstanceOf(MediaRequestException.class);
	}
}
