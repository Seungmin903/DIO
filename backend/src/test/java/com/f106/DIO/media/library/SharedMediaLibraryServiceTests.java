package com.f106.DIO.media.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.f106.DIO.diary.service.DiaryAccessService;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.library.domain.DiaryMediaLibrary;
import com.f106.DIO.media.library.repository.DiaryMediaLibraryRepository;
import com.f106.DIO.media.library.service.SharedMediaLibraryService;
import com.f106.DIO.media.library.support.SharedMediaLibraryException;
import com.f106.DIO.media.repository.MediaFileRepository;

class SharedMediaLibraryServiceTests {
	private final DiaryAccessService diaryAccess = mock(DiaryAccessService.class);
	private final DiaryMediaLibraryRepository library = mock(DiaryMediaLibraryRepository.class);
	private final MediaFileRepository mediaFiles = mock(MediaFileRepository.class);
	private final SharedMediaLibraryService service = new SharedMediaLibraryService(diaryAccess, library, mediaFiles);

	@Test
	void addsTheRequestersStickerToTheSharedLibrary() {
		UUID diaryId = UUID.randomUUID(); UUID mediaFileId = UUID.randomUUID();
		MediaFile media = media(mediaFileId, 11L, MediaLibraryCategory.STICKER);
		DiaryMediaLibrary entry = new DiaryMediaLibrary(diaryId, mediaFileId, 11L, MediaLibraryCategory.STICKER);
		when(mediaFiles.findOwnedForUpdate(mediaFileId, 11L)).thenReturn(Optional.of(media));
		when(library.insertIfAbsent(diaryId, mediaFileId, 11L, "STICKER")).thenReturn(1);
		when(library.findByDiaryIdAndMediaFileId(diaryId, mediaFileId)).thenReturn(Optional.of(entry));

		var result = service.add(diaryId, mediaFileId, 11L);

		assertThat(result.mediaFileId()).isEqualTo(mediaFileId);
		assertThat(result.libraryCategory()).isEqualTo("STICKER");
		verify(diaryAccess).requireWrite(diaryId, 11L);
	}

	@Test
	void addsTheRequestersEditableSourceToTheSharedLibrary() {
		UUID diaryId = UUID.randomUUID(); UUID mediaFileId = UUID.randomUUID();
		MediaFile media = new MediaFile(mediaFileId, 11L, MediaType.DOCUMENT, MediaLibraryCategory.DOCUMENT,
			"media/document/2026/10/" + mediaFileId + ".svg", "logo.svg", "image/svg+xml", 10, "0".repeat(64));
		when(mediaFiles.findOwnedForUpdate(mediaFileId, 11L)).thenReturn(Optional.of(media));
		when(library.insertIfAbsent(diaryId, mediaFileId, 11L, "DOCUMENT")).thenReturn(1);
		when(library.findByDiaryIdAndMediaFileId(diaryId, mediaFileId))
			.thenReturn(Optional.of(new DiaryMediaLibrary(diaryId, mediaFileId, 11L, MediaLibraryCategory.DOCUMENT)));

		assertThat(service.add(diaryId, mediaFileId, 11L).libraryCategory()).isEqualTo("DOCUMENT");
	}

	@Test
	void rejectsPhotosFromTheSharedStickerAndTapeLibrary() {
		UUID mediaFileId = UUID.randomUUID();
		when(mediaFiles.findOwnedForUpdate(mediaFileId, 11L))
			.thenReturn(Optional.of(media(mediaFileId, 11L, MediaLibraryCategory.PHOTO)));

		assertThatThrownBy(() -> service.add(UUID.randomUUID(), mediaFileId, 11L))
			.isInstanceOf(SharedMediaLibraryException.class)
			.hasMessageContaining("스티커·테이프·편집 원본");
	}

	@Test
	void rejectsDuplicateLibraryEntriesWithoutOverwritingTheOriginalEntry() {
		UUID diaryId = UUID.randomUUID(); UUID mediaFileId = UUID.randomUUID();
		when(mediaFiles.findOwnedForUpdate(mediaFileId, 11L))
			.thenReturn(Optional.of(media(mediaFileId, 11L, MediaLibraryCategory.TAPE)));
		when(library.insertIfAbsent(diaryId, mediaFileId, 11L, "TAPE")).thenReturn(0);

		assertThatThrownBy(() -> service.add(diaryId, mediaFileId, 11L))
			.isInstanceOf(SharedMediaLibraryException.class)
			.hasMessageContaining("이미 공유 보관함");
	}

	@Test
	void listsOnlyActiveMediaForReadMembers() {
		UUID diaryId = UUID.randomUUID(); UUID activeId = UUID.randomUUID(); UUID deletedId = UUID.randomUUID();
		DiaryMediaLibrary active = new DiaryMediaLibrary(diaryId, activeId, 11L, MediaLibraryCategory.STICKER);
		DiaryMediaLibrary deleted = new DiaryMediaLibrary(diaryId, deletedId, 12L, MediaLibraryCategory.TAPE);
		when(library.findFirstActivePage(org.mockito.ArgumentMatchers.eq(diaryId), org.mockito.ArgumentMatchers.any())).thenReturn(List.of(active, deleted));
		when(mediaFiles.findAllByMediaFileIdInAndDeletedAtIsNull(List.of(activeId, deletedId)))
			.thenReturn(List.of(media(activeId, 11L, MediaLibraryCategory.STICKER)));

		var result = service.list(diaryId, 22L, 30, null);

		assertThat(result.mediaFiles()).extracting(item -> item.mediaFileId()).containsExactly(activeId);
		assertThat(result.nextCursor()).isNull();
		verify(diaryAccess).requireRead(diaryId, 22L);
	}

	@Test
	void pagesTheSharedLibraryWithTheSameCursorContractAsThePersonalLibrary() {
		UUID diaryId = UUID.randomUUID(); UUID first = UUID.randomUUID(), second = UUID.randomUUID(), third = UUID.randomUUID();
		var entries = List.of(new DiaryMediaLibrary(diaryId, first, 11L, MediaLibraryCategory.STICKER),
			new DiaryMediaLibrary(diaryId, second, 11L, MediaLibraryCategory.STICKER),
			new DiaryMediaLibrary(diaryId, third, 11L, MediaLibraryCategory.STICKER));
		when(library.findFirstActivePage(org.mockito.ArgumentMatchers.eq(diaryId), org.mockito.ArgumentMatchers.eq(org.springframework.data.domain.PageRequest.of(0, 3))))
			.thenReturn(entries);
		when(mediaFiles.findAllByMediaFileIdInAndDeletedAtIsNull(List.of(first, second)))
			.thenReturn(List.of(media(first, 11L, MediaLibraryCategory.STICKER), media(second, 11L, MediaLibraryCategory.STICKER)));

		var page = service.list(diaryId, 22L, 2, null);

		assertThat(page.mediaFiles()).extracting(item -> item.mediaFileId()).containsExactly(first, second);
		var cursor = com.f106.DIO.media.support.MediaListCursor.decode(page.nextCursor());
		assertThat(cursor.mediaFileId()).isEqualTo(second);
		assertThat(cursor.createdAt()).isEqualTo(entries.get(1).getCreatedAt());
	}

	@Test
	void rejectsOutOfRangeLimitsAndBrokenCursors() {
		UUID diaryId = UUID.randomUUID();
		assertThatThrownBy(() -> service.list(diaryId, 22L, 0, null)).isInstanceOf(com.f106.DIO.media.support.MediaRequestException.class);
		assertThatThrownBy(() -> service.list(diaryId, 22L, 101, null)).isInstanceOf(com.f106.DIO.media.support.MediaRequestException.class);
		assertThatThrownBy(() -> service.list(diaryId, 22L, 30, "not-a-cursor")).isInstanceOf(com.f106.DIO.media.support.MediaRequestException.class);
	}

	@Test
	void removesOnlyTheSharedLibraryReference() {
		UUID diaryId = UUID.randomUUID(); UUID mediaFileId = UUID.randomUUID();
		when(library.deleteByDiaryIdAndMediaFileId(diaryId, mediaFileId)).thenReturn(1);

		service.delete(diaryId, mediaFileId, 11L);

		verify(diaryAccess).requireWrite(diaryId, 11L);
		verify(library).deleteByDiaryIdAndMediaFileId(diaryId, mediaFileId);
	}

	@Test
	void mediaOwnerCanUnshareWithoutCurrentDiaryWriteAccess() {
		UUID diaryId = UUID.randomUUID(); UUID mediaFileId = UUID.randomUUID();
		when(mediaFiles.existsByMediaFileIdAndOwnerUserId(mediaFileId, 11L)).thenReturn(true);
		org.mockito.Mockito.doThrow(new com.f106.DIO.diary.support.DiaryAccessDeniedException())
			.when(diaryAccess).requireWrite(diaryId, 11L);
		when(library.deleteByDiaryIdAndMediaFileId(diaryId, mediaFileId)).thenReturn(1);

		service.delete(diaryId, mediaFileId, 11L);

		verify(diaryAccess, org.mockito.Mockito.never()).requireWrite(diaryId, 11L);
		verify(library).deleteByDiaryIdAndMediaFileId(diaryId, mediaFileId);
	}

	private static MediaFile media(UUID mediaFileId, Long ownerUserId, MediaLibraryCategory category) {
		return new MediaFile(mediaFileId, ownerUserId, MediaType.IMAGE, category, "media/image/2026/10/" + mediaFileId + ".png",
			"asset.png", "image/png", 10, "0".repeat(64));
	}
}
