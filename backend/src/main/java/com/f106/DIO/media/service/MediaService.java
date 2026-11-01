package com.f106.DIO.media.service;

import java.io.IOException;
import java.io.PushbackInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaStorageDeletionTask;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.dto.MediaFileListResponse;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.support.MediaRequestException;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.storage.MediaStorageKeys;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MediaService {
	private static final Logger log = LoggerFactory.getLogger(MediaService.class);
	private static final int MAX_FILE_SIZE = 5 * 1024 * 1024;
	private static final int MAX_FONT_SIZE = 25 * 1024 * 1024;
	private static final int MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;
	private final MediaFiles files;
	private final MediaFileTransactionService transactions;
	private final MediaStorageDeletionQueueService deletionQueue;
	private final GuardedMediaOperations guarded;
	private final MediaUploadAdmission admission;
	public MediaService(MediaFiles files, MediaFileTransactionService transactions, MediaStorageDeletionQueueService deletionQueue, GuardedMediaOperations guarded, MediaUploadAdmission admission) {
		this.files = files; this.transactions = transactions; this.deletionQueue = deletionQueue; this.guarded = guarded; this.admission = admission;
	}

	public MediaFileResponse upload(MultipartFile upload, String requestedCategory, Long userId) {
		try (var permit = admission.acquire()) {
		byte[] content = read(upload);
		MediaUploadInspector.FileKind kind = MediaUploadInspector.inspect(content);
		if (kind.mediaType() != MediaType.FONT && kind.mediaType() != MediaType.DOCUMENT && content.length > MAX_FILE_SIZE) throw MediaRequestException.tooLarge();
		MediaLibraryCategory category = category(kind.mediaType(), requestedCategory);
		UUID id = UUID.randomUUID();
		String key = MediaStorageKeys.create(kind.mediaType(), kind.extension(), id);
		MediaFile mediaFile = new MediaFile(id, userId, kind.mediaType(), category, key, filename(upload.getOriginalFilename()),
			kind.mimeType(), content.length, checksum(content));
		MediaStorageDeletionTask cleanupTask = deletionQueue.reserveUploadCleanup(id, key);
		// A failure leaves the independently committed reservation for delayed recovery.
		return guarded.upload(mediaFile, cleanupTask.getDeletionId(), content, kind.mimeType());
		}
	}

	public MediaFileListResponse list(Long userId, int limit, String cursor) {
		return transactions.list(userId, limit, cursor);
	}

	public MediaFileResponse detail(UUID mediaFileId, Long userId) {
		return transactions.detail(mediaFileId, userId);
	}

	public DownloadedMedia file(UUID mediaFileId, Long userId) {
		MediaFileTransactionService.StorageReference reference = transactions.storageReference(mediaFileId, userId);
		return new DownloadedMedia(reference.mimeType(), downloadName(reference), files.read(reference.storageKey()));
	}

	public void delete(UUID mediaFileId, Long userId) {
		transactions.delete(mediaFileId, userId);
	}
	private static byte[] read(MultipartFile upload) {
		if (upload == null || upload.isEmpty()) throw MediaRequestException.invalidFile();
		try (var in = new PushbackInputStream(upload.getInputStream(), 1024)) {
			byte[] header = in.readNBytes(1024);
			if (header.length == 0) throw MediaRequestException.invalidFile();
			in.unread(header);
			boolean font = MediaUploadInspector.isFontHeader(header);
			boolean document = MediaUploadInspector.hasPdfHeader(header);
			int limit = font ? MAX_FONT_SIZE : document ? MAX_DOCUMENT_SIZE : MAX_FILE_SIZE;
			if (upload.getSize() > limit) throw tooLarge(font, document);
			byte[] content = in.readNBytes(limit + 1);
			if (content.length > limit) throw tooLarge(font, document);
			return content;
		} catch (IOException error) { throw MediaRequestException.invalidFile(); }
	}
	private static MediaRequestException tooLarge(boolean font, boolean document) {
		return font ? MediaRequestException.fontTooLarge() : document ? MediaRequestException.documentTooLarge() : MediaRequestException.tooLarge();
	}
	private static String downloadName(MediaFileTransactionService.StorageReference reference) {
		if (reference.originalFilename() != null && !reference.originalFilename().isBlank()) return reference.originalFilename();
		return switch (reference.mimeType()) {
			case "application/pdf" -> "document.pdf";
			default -> null;
		};
	}
	private static MediaLibraryCategory category(MediaType mediaType, String requestedCategory) {
		if (requestedCategory == null || requestedCategory.isBlank()) return mediaType == MediaType.IMAGE ? MediaLibraryCategory.PHOTO : mediaType == MediaType.FONT ? MediaLibraryCategory.FONT : mediaType == MediaType.DOCUMENT ? MediaLibraryCategory.DOCUMENT : MediaLibraryCategory.AUDIO;
		try {
			MediaLibraryCategory category = MediaLibraryCategory.valueOf(requestedCategory.strip().toUpperCase(Locale.ROOT));
			if ((mediaType == MediaType.IMAGE && (category == MediaLibraryCategory.AUDIO || category == MediaLibraryCategory.FONT || category == MediaLibraryCategory.DOCUMENT))
				|| (mediaType == MediaType.AUDIO && category != MediaLibraryCategory.AUDIO) || (mediaType == MediaType.FONT && category != MediaLibraryCategory.FONT)
				|| (mediaType == MediaType.DOCUMENT && category != MediaLibraryCategory.DOCUMENT)) throw MediaRequestException.invalidCategory();
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
	public record DownloadedMedia(String mimeType, String downloadName, byte[] content) {}
}
