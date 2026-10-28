package com.f106.DIO.media.service;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.dto.MediaFileListResponse;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.support.MediaFileNotFoundException;
import com.f106.DIO.media.support.MediaRequestException;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.storage.MediaStorageKeys;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MediaService {
	private static final Logger log = LoggerFactory.getLogger(MediaService.class);
	private static final int MAX_FILE_SIZE = 5 * 1024 * 1024;
	private final MediaFileRepository mediaFiles;
	private final MediaFiles files;
	public MediaService(MediaFileRepository mediaFiles, MediaFiles files) { this.mediaFiles = mediaFiles; this.files = files; }

	@Transactional
	public MediaFileResponse upload(MultipartFile upload, String requestedCategory, Long userId) {
		byte[] content = read(upload);
		MediaUploadInspector.FileKind kind = MediaUploadInspector.inspect(content);
		MediaLibraryCategory category = category(kind.mediaType(), requestedCategory);
		UUID id = UUID.randomUUID();
		String key = MediaStorageKeys.create(kind.mediaType(), kind.extension(), id);
		MediaFile mediaFile = new MediaFile(id, userId, kind.mediaType(), category, key, filename(upload.getOriginalFilename()),
			kind.mimeType(), content.length, checksum(content));
		boolean stored = false;
		try {
			files.put(key, content, kind.mimeType());
			stored = true;
			mediaFiles.save(mediaFile);
			registerRollbackCleanup(key);
			return MediaFileResponse.from(mediaFile);
		} catch (RuntimeException error) {
			if (stored) deleteOrLog(key);
			throw error;
		}
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
	public DownloadedMedia file(UUID mediaFileId, Long userId) {
		MediaFile mediaFile = findOwned(mediaFileId, userId);
		return new DownloadedMedia(mediaFile.getMimeType(), files.read(mediaFile.getStorageKey()));
	}

	@Transactional
	public void delete(UUID mediaFileId, Long userId) {
		MediaFile mediaFile = mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, userId).orElseThrow(MediaFileNotFoundException::new);
		mediaFile.softDelete();
		mediaFiles.flush();
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			String key = mediaFile.getStorageKey();
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override public void afterCommit() { deleteOrLog(key); }
			});
		} else deleteOrLog(mediaFile.getStorageKey());
	}

	private MediaFile findOwned(UUID mediaFileId, Long userId) {
		return mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, userId).orElseThrow(MediaFileNotFoundException::new);
	}
	private void registerRollbackCleanup(String key) {
		if (!TransactionSynchronizationManager.isSynchronizationActive()) return;
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override public void afterCompletion(int status) { if (status == STATUS_ROLLED_BACK) deleteOrLog(key); }
		});
	}
	private void deleteOrLog(String key) {
		try { files.delete(key); }
		catch (RuntimeException error) { log.warn("Media storage cleanup failed: key={}", key, error); }
	}
	private static byte[] read(MultipartFile upload) {
		if (upload == null || upload.isEmpty()) throw MediaRequestException.invalidFile();
		if (upload.getSize() > MAX_FILE_SIZE) throw MediaRequestException.tooLarge();
		try {
			byte[] content = upload.getInputStream().readNBytes(MAX_FILE_SIZE + 1);
			if (content.length == 0) throw MediaRequestException.invalidFile();
			if (content.length > MAX_FILE_SIZE) throw MediaRequestException.tooLarge();
			return content;
		} catch (IOException error) { throw MediaRequestException.invalidFile(); }
	}
	private static MediaLibraryCategory category(MediaType mediaType, String requestedCategory) {
		if (requestedCategory == null || requestedCategory.isBlank()) return mediaType == MediaType.IMAGE ? MediaLibraryCategory.PHOTO : MediaLibraryCategory.AUDIO;
		try {
			MediaLibraryCategory category = MediaLibraryCategory.valueOf(requestedCategory.strip().toUpperCase(Locale.ROOT));
			if ((mediaType == MediaType.IMAGE && category == MediaLibraryCategory.AUDIO)
				|| (mediaType == MediaType.AUDIO && category != MediaLibraryCategory.AUDIO)) throw MediaRequestException.invalidCategory();
			return category;
		} catch (IllegalArgumentException error) { throw MediaRequestException.invalidCategory(); }
	}
	private static String filename(String filename) {
		if (filename == null || filename.isBlank()) return null;
		String base = filename.replace('\\', '/');
		base = base.substring(base.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").strip();
		return base.isBlank() ? null : base.substring(0, Math.min(base.length(), 255));
	}
	private static String checksum(byte[] content) {
		try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content)); }
		catch (NoSuchAlgorithmException error) { throw new IllegalStateException("SHA-256 unavailable", error); }
	}
	public record DownloadedMedia(String mimeType, byte[] content) {}
}
