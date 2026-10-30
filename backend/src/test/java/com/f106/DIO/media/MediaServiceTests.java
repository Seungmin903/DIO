package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaStorageDeletionTask;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.service.MediaFileTransactionService;
import com.f106.DIO.media.service.MediaService;
import com.f106.DIO.media.service.GuardedMediaOperations;
import com.f106.DIO.media.service.MediaUploadAdmission;
import com.f106.DIO.media.service.MediaStorageDeletionQueueService;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.support.MediaRequestException;

class MediaServiceTests {
	private final MediaFiles storage = mock(MediaFiles.class);
	private final MediaFileTransactionService transactions = mock(MediaFileTransactionService.class);
	private final MediaStorageDeletionQueueService deletionQueue = mock(MediaStorageDeletionQueueService.class);
	private final GuardedMediaOperations guarded = mock(GuardedMediaOperations.class);
	private final MediaService service = new MediaService(storage, transactions, deletionQueue, guarded, new MediaUploadAdmission(3,8,250));

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
	void acceptsM4bAudioBrand() {
		byte[] m4b = new byte[] {0, 0, 0, 24, 'f', 't', 'y', 'p', 'M', '4', 'B', ' '};
		stubPersist();

		var response = service.upload(new MockMultipartFile("file", "book.m4b", "audio/mp4", m4b), null, 7L);

		assertThat(response.mediaType()).isEqualTo("AUDIO");
		assertThat(response.mimeType()).isEqualTo("audio/mp4");
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

	@Test
	void keepsTheUploadCleanupTaskWhenPersistenceAndImmediateStorageCleanupFail() {
		when(deletionQueue.reserveUploadCleanup(any(), any())).thenAnswer(invocation ->
			new MediaStorageDeletionTask(invocation.getArgument(0), invocation.getArgument(1)));
		stubPersist();
		when(transactions.persist(any(MediaFile.class), any())).thenThrow(new IllegalStateException("database unavailable"));
		doThrow(new IllegalStateException("S3 unavailable")).when(storage).delete(any());

		assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "failed.gif", "image/gif", "GIF89a".getBytes()), null, 7L))
			.isInstanceOf(IllegalStateException.class);

		verify(storage, org.mockito.Mockito.never()).delete(any());
	}

	@Test
	void keepsTheUploadCleanupTaskWhenPutOutcomeIsUnknownAndCleanupFails() {
		when(deletionQueue.reserveUploadCleanup(any(), any())).thenAnswer(invocation ->
			new MediaStorageDeletionTask(invocation.getArgument(0), invocation.getArgument(1)));
		stubPersist();
		doThrow(new IllegalStateException("S3 timeout")).when(storage).put(any(), any(), any());
		doThrow(new IllegalStateException("S3 unavailable")).when(storage).delete(any());

		assertThatThrownBy(() -> service.upload(new MockMultipartFile("file", "timeout.gif", "image/gif", "GIF89a".getBytes()), null, 7L))
			.isInstanceOf(IllegalStateException.class);

		verify(storage, org.mockito.Mockito.never()).delete(any());
	}

	@Test
	void fontUploadAcceptsTwentyTwoPointFiveMiBAndUsesFontCategory() {
		for (boolean otf : new boolean[] {false, true}) {
			byte[] bytes = new byte[22 * 1024 * 1024 + 512 * 1024];
			byte[] sample=sampleFont(otf); System.arraycopy(sample,0,bytes,0,sample.length);
			stubPersist();
			var result=service.upload(new MockMultipartFile("file", "hand.font", "application/octet-stream", bytes), null, 7L);
			assertThat(result.mediaType()).isEqualTo("FONT"); assertThat(result.libraryCategory()).isEqualTo("FONT");
			assertThat(result.fileSize()).isEqualTo(bytes.length); assertThat(result.mimeType()).isEqualTo(otf ? "font/otf" : "font/ttf");
		}
	}
	@Test
	void fontAndOtherMediaRetainSeparateLimitsAndCategories() {
		byte[] jpeg = new byte[5 * 1024 * 1024 + 1]; jpeg[0]=(byte)0xff; jpeg[1]=(byte)0xd8; jpeg[2]=(byte)0xff;
		assertThatThrownBy(()->service.upload(new MockMultipartFile("file","x.jpg","image/jpeg",jpeg),null,7L)).isInstanceOfSatisfying(MediaRequestException.class, e -> { assertThat(e.status().value()).isEqualTo(413); assertThat(e.code()).isEqualTo("MEDIA_FILE_TOO_LARGE"); assertThat(e.getMessage()).contains("5MiB"); });
		byte[] ttf = new byte[25 * 1024 * 1024 + 1]; ttf[1]=1;
		assertThatThrownBy(()->service.upload(new MockMultipartFile("file","x.ttf","font/ttf",ttf),null,7L)).isInstanceOfSatisfying(MediaRequestException.class, e -> { assertThat(e.status().value()).isEqualTo(413); assertThat(e.code()).isEqualTo("MEDIA_FILE_TOO_LARGE"); assertThat(e.getMessage()).contains("25MiB"); });
		byte[] small = sampleFont(false);
		assertThatThrownBy(()->service.upload(new MockMultipartFile("file","x.ttf","font/ttf",small),"PHOTO",7L)).isInstanceOf(MediaRequestException.class);
	}
	@Test
	void rejectsTruncatedOrMalformedFontDirectories() {
		for (boolean otf : new boolean[] {false, true}) {
			byte[] valid=sampleFont(otf);
			byte[] truncated=java.util.Arrays.copyOf(valid, 20);
			byte[] outOfBounds=valid.clone(); outOfBounds[20]=(byte)0xff;
			byte[] duplicate=valid.clone(); System.arraycopy(duplicate,12,duplicate,28,4);
			byte[] empty=valid.clone(); empty[24]=empty[25]=empty[26]=empty[27]=0;
			for(byte[] bad : java.util.List.of(truncated,outOfBounds,duplicate,empty))
				assertThatThrownBy(()->service.upload(new MockMultipartFile("file","bad.font","application/octet-stream",bad),null,7L)).isInstanceOf(MediaRequestException.class);
		}
	}
	@Test
	void acceptsBundledRealTrueTypeFile() throws java.io.IOException {
		byte[] data=java.nio.file.Files.readAllBytes(java.nio.file.Path.of("../frontend/assets/fonts/gowundodum/GowunDodum-Regular.ttf"));stubPersist();
		var result=service.upload(new MockMultipartFile("file","real.ttf","font/ttf",data),null,7L);
		assertThat(result.mimeType()).isEqualTo("font/ttf"); assertThat(result.fileSize()).isEqualTo(data.length);
	}
	@Test
	void checksTheExistingNonFontSizeLimitBeforeReadingTheWholeFile() {
		byte[] bytes=new byte[5*1024*1024+1]; bytes[0]=(byte)0xff;bytes[1]=(byte)0xd8;bytes[2]=(byte)0xff;
		var stream=new java.io.ByteArrayInputStream(bytes) { int total; @Override public synchronized int read(byte[] b,int off,int len) { int n=super.read(b,off,len); if(n>0) {total+=n; if(total>12) throw new AssertionError("read beyond header");} return n; } };
		var file=mock(org.springframework.web.multipart.MultipartFile.class);
		try { when(file.isEmpty()).thenReturn(false);when(file.getSize()).thenReturn((long)bytes.length);when(file.getInputStream()).thenReturn(stream); }
		catch(java.io.IOException e) { throw new AssertionError(e); }
		assertThatThrownBy(()->service.upload(file,null,7L)).isInstanceOfSatisfying(MediaRequestException.class,e->assertThat(e.status().value()).isEqualTo(413));
	}
	private static byte[] sampleFont(boolean otf) {
		String[] tags=otf ? new String[]{"head","maxp","cmap","name","hhea","hmtx","CFF "} : new String[]{"head","maxp","cmap","name","hhea","hmtx","glyf","loca"};
		int end=12+tags.length*16;byte[] data=new byte[end+tags.length]; if(otf){data[0]='O';data[1]='T';data[2]='T';data[3]='O';}else data[1]=1;data[5]=(byte)tags.length;
		for(int i=0;i<tags.length;i++){int pos=12+i*16;byte[] tag=tags[i].getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);System.arraycopy(tag,0,data,pos,4);java.nio.ByteBuffer.wrap(data).putInt(pos+8,end+i).putInt(pos+12,1);data[end+i]=1;}
		return data;
	}
	private void stubPersist() {
		when(deletionQueue.reserveUploadCleanup(any(), any())).thenAnswer(invocation ->
			new MediaStorageDeletionTask(invocation.getArgument(0), invocation.getArgument(1)));
		when(transactions.persist(any(MediaFile.class), any())).thenAnswer(invocation -> MediaFileResponse.from(invocation.getArgument(0)));
		org.mockito.Mockito.doAnswer(call -> { MediaFile media=call.getArgument(0); storage.put(media.getStorageKey(),call.getArgument(2),call.getArgument(3)); return transactions.persist(media,call.getArgument(1)); }).when(guarded).upload(any(),any(),any(),any());
	}
}
