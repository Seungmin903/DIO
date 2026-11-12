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
import com.f106.DIO.media.library.repository.DiaryMediaLibraryRepository;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.service.MediaFileTransactionService;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.support.MediaFileNotFoundException;
import com.f106.DIO.media.support.MediaRequestException;

class MediaFileTransactionServiceTests {
	private final MediaFileRepository mediaFiles = mock(MediaFileRepository.class);
	private final DiaryMediaLibraryRepository sharedLibrary = mock(DiaryMediaLibraryRepository.class);
	private final MediaStorageDeletionTaskRepository deletionTasks = mock(MediaStorageDeletionTaskRepository.class);
	private final com.f106.DIO.media.service.CanvasMediaAccess canvasMedia = mock(com.f106.DIO.media.service.CanvasMediaAccess.class);
	private final MediaFileTransactionService service = new MediaFileTransactionService(mediaFiles, sharedLibrary, deletionTasks, canvasMedia, org.mockito.Mockito.mock(com.f106.DIO.inventory.InventoryLimits.class));

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value=MediaLibraryCategory.class,names={"STICKER","TAPE"})
    void referencedDecorationsCannotBeDeletedFromCanvas(MediaLibraryCategory category) {
        var file=decoration(category);
        when(mediaFiles.findOwnedForUpdate(file.getMediaFileId(),2L)).thenReturn(Optional.of(file));
        when(canvasMedia.retained(file.getMediaFileId())).thenReturn(true);
        assertProtected(file,"MEDIA_FILE_IN_CANVAS");
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value=MediaLibraryCategory.class,names={"STICKER","TAPE"})
    void referencedDecorationsCannotBeDeletedFromSharedLibrary(MediaLibraryCategory category) {
        var file=decoration(category);
        when(mediaFiles.findOwnedForUpdate(file.getMediaFileId(),2L)).thenReturn(Optional.of(file));
        when(mediaFiles.existsInSharedLibrary(eq(file.getMediaFileId()),any())).thenReturn(true);
        assertProtected(file,"MEDIA_FILE_SHARED");
    }
    private MediaFile decoration(MediaLibraryCategory category) {
        var id=UUID.randomUUID();
        return new MediaFile(id,2L,MediaType.IMAGE,category,"media/image/"+id+".png","asset.png","image/png",1,"0".repeat(64));
    }
    private void assertProtected(MediaFile file,String code) {
        assertThatThrownBy(()->service.delete(file.getMediaFileId(),2L)).isInstanceOfSatisfying(MediaRequestException.class,e->{
            assertThat(e.status().value()).isEqualTo(409);
            assertThat(e.code()).isEqualTo(code);
        });
        assertThat(file.getDeletedAt()).isNull();
        assertThat(file.getLibraryRemovedAt()).isNull();
    }

	@Test
	void removesTheUploadCleanupTaskWithTheSuccessfulMediaPersistence() {
		MediaFile mediaFile = media(2L);
		UUID cleanupTaskId = UUID.randomUUID();

		service.persist(mediaFile, cleanupTaskId);

		var order = inOrder(mediaFiles, deletionTasks);
		order.verify(mediaFiles).saveAndFlush(mediaFile);
		order.verify(deletionTasks).deleteById(cleanupTaskId);
	}

	@Test
	void rejectsAnotherUsersMediaAsNotFound() {
		UUID mediaFileId = UUID.randomUUID();
		when(mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, 2L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.storageReference(mediaFileId, 2L)).isInstanceOf(MediaFileNotFoundException.class);
	}

	@Test
	void deletingPhotoInSharedLibraryHidesInventoryButPreservesOriginal() {
		MediaFile mediaFile = media(2L);
		when(mediaFiles.findOwnedForUpdate(mediaFile.getMediaFileId(), 2L)).thenReturn(Optional.of(mediaFile));
		when(mediaFiles.existsInSharedLibrary(org.mockito.ArgumentMatchers.eq(mediaFile.getMediaFileId()), org.mockito.ArgumentMatchers.any())).thenReturn(true);

		service.delete(mediaFile.getMediaFileId(), 2L);
        assertThat(mediaFile.getLibraryRemovedAt()).isNotNull();
        assertThat(mediaFile.getDeletedAt()).isNull();
	}

	@Test
	void allowsAReadMemberToLoadAnActiveSharedLibraryFile() {
		MediaFile mediaFile = media(1L);
		when(mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFile.getMediaFileId(), 2L)).thenReturn(Optional.empty());
		when(mediaFiles.findByMediaFileIdAndDeletedAtIsNull(mediaFile.getMediaFileId())).thenReturn(Optional.of(mediaFile));
		when(sharedLibrary.isReadableByMember(mediaFile.getMediaFileId(), 2L)).thenReturn(true);

		assertThat(service.storageReference(mediaFile.getMediaFileId(), 2L).storageKey()).isEqualTo(mediaFile.getStorageKey());
	}

	@Test
	void hidesSharedMediaFromUsersWhoCannotReadAnySharingDiary() {
		// 비참여자·탈퇴자·삭제된 다이어리는 모두 isReadableByMember=false로 모인다. 쿼리 자체는 PostgreSQL 테스트가 검증한다.
		MediaFile mediaFile = media(1L);
		when(mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFile.getMediaFileId(), 2L)).thenReturn(Optional.empty());
		when(mediaFiles.findByMediaFileIdAndDeletedAtIsNull(mediaFile.getMediaFileId())).thenReturn(Optional.of(mediaFile));
		when(sharedLibrary.isReadableByMember(mediaFile.getMediaFileId(), 2L)).thenReturn(false);

		assertThatThrownBy(() -> service.storageReference(mediaFile.getMediaFileId(), 2L)).isInstanceOf(MediaFileNotFoundException.class);
	}

	@Test
	void hidesDeletedSharedMediaEvenFromReadMembers() {
		UUID mediaFileId = UUID.randomUUID();
		when(mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, 2L)).thenReturn(Optional.empty());
		when(mediaFiles.findByMediaFileIdAndDeletedAtIsNull(mediaFileId)).thenReturn(Optional.empty());
		when(sharedLibrary.isReadableByMember(mediaFileId, 2L)).thenReturn(true);

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
