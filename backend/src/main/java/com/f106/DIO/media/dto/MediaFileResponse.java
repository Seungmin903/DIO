package com.f106.DIO.media.dto;

import java.time.Instant;
import java.util.UUID;
import com.f106.DIO.media.domain.MediaFile;

public record MediaFileResponse(UUID mediaFileId, String mediaType, String sourceType, String libraryCategory,
		String originalFilename, String mimeType, long fileSize, String checksumSha256, Instant createdAt) {
	public static MediaFileResponse from(MediaFile mediaFile) {
		return new MediaFileResponse(mediaFile.getMediaFileId(), mediaFile.getMediaType().name(), mediaFile.getSourceType().name(),
			mediaFile.getLibraryCategory().name(), mediaFile.getOriginalFilename(), mediaFile.getMimeType(), mediaFile.getFileSize(),
			mediaFile.getChecksumSha256(), mediaFile.getCreatedAt());
	}
}
