package com.f106.DIO.media.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import com.f106.DIO.sharing.service.DiaryInviteService.AuthorizedCoverImage;
import org.springframework.data.domain.PageRequest;
import com.f106.DIO.diary.support.DiaryRetention;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.dto.MediaFileListResponse;
import com.f106.DIO.media.library.repository.DiaryMediaLibraryRepository;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.repository.MediaStorageDeletionTaskRepository;
import com.f106.DIO.media.support.MediaFileNotFoundException;
import com.f106.DIO.media.support.MediaListCursor;
import com.f106.DIO.media.support.MediaRequestException;

/** DB 작업만 트랜잭션으로 묶고, 저장소 읽기·쓰기는 MediaService가 트랜잭션 밖에서 수행한다. */
@Service
public class MediaFileTransactionService {
	private final com.f106.DIO.inventory.InventoryLimits inventory;
	private final MediaFileRepository mediaFiles;
    private final CanvasMediaAccess canvasMedia;
	private final DiaryMediaLibraryRepository sharedLibrary;
	private final MediaStorageDeletionTaskRepository deletionTasks;

	public MediaFileTransactionService(MediaFileRepository mediaFiles, DiaryMediaLibraryRepository sharedLibrary,
			MediaStorageDeletionTaskRepository deletionTasks, CanvasMediaAccess canvasMedia, com.f106.DIO.inventory.InventoryLimits inventory) {
        this.inventory=java.util.Objects.requireNonNull(inventory,"inventory");
		this.canvasMedia=canvasMedia; this.mediaFiles = mediaFiles; this.sharedLibrary = sharedLibrary;
		this.deletionTasks = deletionTasks;
	}

	@Transactional
	public MediaFileResponse persist(MediaFile mediaFile, UUID uploadCleanupTaskId) {
		mediaFiles.saveAndFlush(mediaFile);
		inventory.completeMedia(mediaFile.getOwnerUserId(),mediaFile.getLibraryCategory().name(),mediaFile.getInventoryReservationId());
		deletionTasks.deleteById(uploadCleanupTaskId);
		return MediaFileResponse.from(mediaFile);
	}

	@Transactional(readOnly = true)
	public MediaFileListResponse list(Long userId, int limit, String encodedCursor) {
		MediaListCursor.requireValidLimit(limit);
		MediaListCursor cursor = MediaListCursor.decode(encodedCursor);
		PageRequest pageRequest = PageRequest.of(0, limit + 1);
		List<MediaFile> candidates = cursor == null ? mediaFiles.findFirstActivePage(userId, pageRequest)
			: mediaFiles.findActivePageAfter(userId, cursor.createdAt(), cursor.mediaFileId(), pageRequest);
		boolean hasNext = candidates.size() > limit;
		List<MediaFile> page = hasNext ? candidates.subList(0, limit) : candidates;
		MediaFile last = page.isEmpty() ? null : page.get(page.size() - 1);
		String nextCursor = hasNext ? MediaListCursor.encode(last.getCreatedAt(), last.getMediaFileId()) : null;
		return new MediaFileListResponse(page.stream().map(MediaFileResponse::from).toList(), nextCursor);
	}

	@Transactional(readOnly = true)
	public MediaFileResponse detail(UUID mediaFileId, Long userId) {
		return MediaFileResponse.from(findOwned(mediaFileId, userId));
	}

	@Transactional(readOnly = true)
	public StorageReference storageReference(UUID mediaFileId, Long userId) {
		MediaFile mediaFile = mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, userId)
			.or(() -> mediaFiles.findKeptInPersonalLibrary(mediaFileId, userId))
			.orElseGet(() -> readableSharedMedia(mediaFileId, userId));
		return new StorageReference(mediaFile.getMimeType(), mediaFile.getOriginalFilename(), mediaFile.getStorageKey());
	}

    @Transactional(readOnly = true)
    StorageReference invitationCoverImageReference(AuthorizedCoverImage authorization) {
        var image = mediaFiles.findByMediaFileIdAndDeletedAtIsNull(authorization.mediaFileId())
            .filter(file -> file.getStatus() == com.f106.DIO.media.domain.MediaStatus.READY
                && file.getMediaType() == com.f106.DIO.media.domain.MediaType.IMAGE)
            .orElseThrow(MediaFileNotFoundException::new);
        return new StorageReference(image.getMimeType(), null, image.getStorageKey());
    }

	@Transactional
	public void delete(UUID mediaFileId, Long userId) {
		MediaFile mediaFile = mediaFiles.findOwnedForUpdate(mediaFileId, userId).orElseThrow(MediaFileNotFoundException::new);
		Instant restorableSince = Instant.now().minus(DiaryRetention.PERIOD);
		if(mediaFile.getLibraryCategory()==com.f106.DIO.media.domain.MediaLibraryCategory.PHOTO){
			mediaFile.removeFromLibrary();
			if(!canvasMedia.retained(mediaFileId)&&!mediaFiles.existsInSharedLibrary(mediaFileId,restorableSince))mediaFile.softDelete();
			mediaFiles.flush();return;
		}
		if (canvasMedia.retained(mediaFileId)) throw MediaRequestException.canvasReference();
		if (mediaFiles.existsInSharedLibrary(mediaFileId, restorableSince)) throw MediaRequestException.sharedLibraryReference();
		mediaFile.softDelete();
		mediaFiles.flush();
	}

	private MediaFile findOwned(UUID mediaFileId, Long userId) {
		return mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, userId).orElseThrow(MediaFileNotFoundException::new);
	}
	private MediaFile readableSharedMedia(UUID mediaFileId, Long userId) {
		MediaFile mediaFile = mediaFiles.findByMediaFileIdAndDeletedAtIsNull(mediaFileId).orElseThrow(MediaFileNotFoundException::new);
		if (!sharedLibrary.isReadableByMember(mediaFileId, userId) && !canvasMedia.readable(mediaFileId,userId)) throw new MediaFileNotFoundException();
		return mediaFile;
	}
	public record StorageReference(String mimeType, String originalFilename, String storageKey) {}
}
