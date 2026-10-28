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
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.service.MediaFileTransactionService;
import com.f106.DIO.media.service.MediaService;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.support.MediaRequestException;

class MediaServiceTests {
	private final MediaFiles storage = mock(MediaFiles.class);
	private final MediaFileTransactionService transactions = mock(MediaFileTransactionService.class);
	private final MediaService service = new MediaService(storage, transactions);

	@Test
	void gifIsStoredAsImageAndKeepsGifMimeType() {
		MockMultipartFile file = new MockMultipartFile("file", "animated.gif", "image/gif", "GIF89a".getBytes());
		stubPersist();

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
		stubPersist();

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

	@Test
	void rejectsHeicInsteadOfTreatingItAsM4a() {
		byte[] heic = new byte[] {0, 0, 0, 24, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c'};

		assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "photo.heic", "image/heic", heic), null, 7L))
			.isInstanceOf(MediaRequestException.class);
	}

	@Test
	void rejectsGenericMp4VideoInsteadOfTreatingItAsM4a() {
		byte[] mp4 = new byte[] {0, 0, 0, 24, 'f', 't', 'y', 'p', 'm', 'p', '4', '2'};

		assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "movie.mp4", "video/mp4", mp4), null, 7L))
			.isInstanceOf(MediaRequestException.class);
	}

	@Test
	void rejectsAnInvalidMp3FrameHeader() {
		byte[] invalid = new byte[] {(byte)0xFF, (byte)0xE0, 0, 0};

		assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "broken.mp3", "audio/mpeg", invalid), null, 7L))
			.isInstanceOf(MediaRequestException.class);
	}

	@Test
	void rejectsWebmUntilItHasAFullEbmlTrackParser() {
		byte[] videoWebm = new byte[] {0x1A, 0x45, (byte)0xDF, (byte)0xA3, 'w', 'e', 'b', 'm', (byte)0x83, (byte)0x81, 0x01};

		assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "movie.webm", "video/webm", videoWebm), null, 7L))
			.isInstanceOf(MediaRequestException.class);
	}

	@Test
	void acceptsAFileAtTheFiveMegabyteLimit() {
		byte[] m4a = new byte[5 * 1024 * 1024];
		m4a[4] = 'f'; m4a[5] = 't'; m4a[6] = 'y'; m4a[7] = 'p'; m4a[8] = 'M'; m4a[9] = '4'; m4a[10] = 'A'; m4a[11] = ' ';
		stubPersist();

		var response = service.upload(new MockMultipartFile("file", "memo.m4a", "audio/mp4", m4a), null, 7L);

		assertThat(response.fileSize()).isEqualTo(5L * 1024 * 1024);
	}

	@Test
	void rejectsAFileLargerThanFiveMegabytes() {
		byte[] oversized = new byte[5 * 1024 * 1024 + 1];

		assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "large.m4a", "audio/mp4", oversized), null, 7L))
			.isInstanceOf(MediaRequestException.class);
	}

	private void stubPersist() {
		when(transactions.persist(any(MediaFile.class))).thenAnswer(invocation -> MediaFileResponse.from(invocation.getArgument(0)));
	}
}
