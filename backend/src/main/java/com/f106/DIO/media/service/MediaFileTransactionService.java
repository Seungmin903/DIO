package com.f106.DIO.media.service;

import java.util.List;
import java.util.UUID;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.dto.MediaFileListResponse;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.support.MediaFileNotFoundException;
import com.f106.DIO.media.support.MediaRequestException;
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
	public MediaFileListResponse list(Long userId, int limit, String encodedCursor) {
		if (limit < 1 || limit > 100) throw MediaRequestException.invalidLimit();
		Cursor cursor = decode(encodedCursor);
		List<MediaFile> candidates = mediaFiles.findActivePage(userId, cursor == null ? null : cursor.createdAt(),
			cursor == null ? null : cursor.mediaFileId(), PageRequest.of(0, limit + 1));
		boolean hasNext = candidates.size() > limit;
		List<MediaFile> page = hasNext ? candidates.subList(0, limit) : candidates;
		String nextCursor = hasNext ? encode(page.get(page.size() - 1)) : null;
		return new MediaFileListResponse(page.stream().map(MediaFileResponse::from).toList(), nextCursor);
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
	}

	private MediaFile findOwned(UUID mediaFileId, Long userId) {
		return mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, userId).orElseThrow(MediaFileNotFoundException::new);
	}
	private void deleteOrLog(String key) {
		try { files.delete(key); }
		catch (RuntimeException error) { log.warn("Unreferenced media storage cleanup failed: key={}", key, error); }
	}
	private static String encode(MediaFile mediaFile) {
		String raw = mediaFile.getCreatedAt() + "|" + mediaFile.getMediaFileId();
		return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
	}
	private static Cursor decode(String encodedCursor) {
		if (encodedCursor == null || encodedCursor.isBlank()) return null;
		try {
			String raw = new String(Base64.getUrlDecoder().decode(encodedCursor), StandardCharsets.UTF_8);
			String[] parts = raw.split("\\|", -1);
			if (parts.length != 2) throw MediaRequestException.invalidCursor();
			return new Cursor(Instant.parse(parts[0]), UUID.fromString(parts[1]));
		} catch (IllegalArgumentException error) { throw MediaRequestException.invalidCursor(); }
	}

	public record StorageReference(String mimeType, String storageKey) {}
	private record Cursor(Instant createdAt, UUID mediaFileId) {}
}
