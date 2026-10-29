package com.f106.DIO.media.library.dto;

import java.time.Instant;
import java.util.UUID;

import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.library.domain.DiaryMediaLibrary;

public record SharedMediaLibraryItemResponse(UUID mediaFileId, String mediaType, String libraryCategory,
		String originalFilename, String mimeType, long fileSize, Long addedByUserId, Instant addedAt) {
	public static SharedMediaLibraryItemResponse from(DiaryMediaLibrary library, MediaFile mediaFile) {
		return new SharedMediaLibraryItemResponse(mediaFile.getMediaFileId(), mediaFile.getMediaType().name(),
			library.getLibraryCategory().name(), mediaFile.getOriginalFilename(), mediaFile.getMimeType(), mediaFile.getFileSize(),
			library.getAddedByUserId(), library.getCreatedAt());
	}
}
