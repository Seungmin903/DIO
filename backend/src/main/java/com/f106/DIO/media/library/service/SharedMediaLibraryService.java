package com.f106.DIO.media.library.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.service.DiaryAccessService;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.library.domain.DiaryMediaLibrary;
import com.f106.DIO.media.library.dto.SharedMediaLibraryItemResponse;
import com.f106.DIO.media.library.dto.SharedMediaLibraryListResponse;
import com.f106.DIO.media.library.repository.DiaryMediaLibraryRepository;
import com.f106.DIO.media.library.support.SharedMediaLibraryException;
import com.f106.DIO.media.repository.MediaFileRepository;
import com.f106.DIO.media.support.MediaFileNotFoundException;

@Service
public class SharedMediaLibraryService {
	private final DiaryAccessService diaryAccess;
	private final DiaryMediaLibraryRepository library;
	private final MediaFileRepository mediaFiles;

	public SharedMediaLibraryService(DiaryAccessService diaryAccess, DiaryMediaLibraryRepository library, MediaFileRepository mediaFiles) {
		this.diaryAccess = diaryAccess;
		this.library = library;
		this.mediaFiles = mediaFiles;
	}

	@Transactional
	public SharedMediaLibraryItemResponse add(UUID diaryId, UUID mediaFileId, Long userId) {
		diaryAccess.requireWrite(diaryId, userId);
		MediaFile mediaFile = mediaFiles.findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(mediaFileId, userId)
			.orElseThrow(MediaFileNotFoundException::new);
		validateCategory(mediaFile.getLibraryCategory());
		if (library.insertIfAbsent(diaryId, mediaFileId, userId, mediaFile.getLibraryCategory().name()) == 0) {
			throw SharedMediaLibraryException.duplicate();
		}
		return SharedMediaLibraryItemResponse.from(library.findByDiaryIdAndMediaFileId(diaryId, mediaFileId)
			.orElseThrow(SharedMediaLibraryException::notFound), mediaFile);
	}

	@Transactional(readOnly = true)
	public SharedMediaLibraryListResponse list(UUID diaryId, Long userId) {
		diaryAccess.requireRead(diaryId, userId);
		List<DiaryMediaLibrary> entries = library.findAllByDiaryIdOrderByCreatedAtDescMediaFileIdDesc(diaryId);
		if (entries.isEmpty()) return new SharedMediaLibraryListResponse(List.of());
		Map<UUID, MediaFile> mediaById = mediaFiles.findAllByMediaFileIdInAndDeletedAtIsNull(entries.stream()
			.map(DiaryMediaLibrary::getMediaFileId).toList()).stream()
			.collect(java.util.stream.Collectors.toMap(MediaFile::getMediaFileId, Function.identity()));
		return new SharedMediaLibraryListResponse(entries.stream()
			.map(entry -> {
				MediaFile mediaFile = mediaById.get(entry.getMediaFileId());
				return mediaFile == null ? null : SharedMediaLibraryItemResponse.from(entry, mediaFile);
			})
			.filter(java.util.Objects::nonNull)
			.toList());
	}

	@Transactional
	public void delete(UUID diaryId, UUID mediaFileId, Long userId) {
		diaryAccess.requireWrite(diaryId, userId);
		if (library.deleteByDiaryIdAndMediaFileId(diaryId, mediaFileId) == 0) throw SharedMediaLibraryException.notFound();
	}

	private static void validateCategory(MediaLibraryCategory category) {
		if (category != MediaLibraryCategory.STICKER && category != MediaLibraryCategory.TAPE) {
			throw SharedMediaLibraryException.unsupportedCategory();
		}
	}
}
