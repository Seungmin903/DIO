package com.f106.DIO.media.service;

import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.dto.MediaFileListResponse;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.support.MediaFileNotFoundException;
import com.f106.DIO.media.storage.MediaFiles;

/** DB 작업만 트랜잭션으로 묶고, 저장소 읽기·쓰기는 MediaService가 트랜잭션 밖에서 수행한다. */
@Service
public class MediaFileTransactionService {
	private static final Logger log = LoggerFactory.getLogger(MediaFileTransactionService.class);
	private final MediaFileRepository mediaFiles;
	private final MediaFiles files;

	public MediaFileTransactionService(MediaFileRepository mediaFiles, MediaFiles files) {
		this.mediaFiles = mediaFiles;
		this.files = files;
	}

	@Transactional
	public MediaFileResponse persist(MediaFile mediaFile) {
		mediaFiles.save(mediaFile);
		String key = mediaFile.getStorageKey();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override public void afterCompletion(int status) {
				if (status == STATUS_ROLLED_BACK) deleteOrLog(key);
			}
		});
		return MediaFileResponse.from(mediaFile);
	}

	@Transactional(readOnly = true)
	public MediaFileListResponse list(Long userId) {
		List<MediaFileResponse> results = mediaFiles.findAllByOwnerUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(userId).stream()
			.map(MediaFileResponse::from).toList();
		return new MediaFileListResponse(results);
	}

	@Transactional(readOnly = true)
	public MediaFileResponse detail(UUID mediaFileId, Long userId) {
		return MediaFileResponse.from(findOwned(mediaFileId, userId));
	}

	@Transactional(readOnly = true)
	public StorageReference storageReference(UUID mediaFileId, Long userId) {
		MediaFile mediaFile = findOwned(mediaFileId, userId);
		return new StorageReference(mediaFile.getMimeType(), mediaFile.getStorageKey());
	}

	@Transactional
	public void delete(UUID mediaFileId, Long userId) {
		MediaFile mediaFile = findOwned(mediaFileId, userId);
		mediaFile.softDelete();
		mediaFiles.flush();
		String key = mediaFile.getStorageKey();
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override public void afterCommit() { deleteOrLog(key); }
		});
	}

	private MediaFile findOwned(UUID mediaFileId, Long userId) {
		return mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, userId).orElseThrow(MediaFileNotFoundException::new);
	}
	private void deleteOrLog(String key) {
		try { files.delete(key); }
		catch (RuntimeException error) { log.warn("Media storage cleanup failed: key={}", key, error); }
	}

	public record StorageReference(String mimeType, String storageKey) {}
}
