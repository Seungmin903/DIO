package com.f106.DIO.media.library.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.data.domain.PageRequest;
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
import com.f106.DIO.media.support.MediaListCursor;

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
		MediaFile mediaFile = mediaFiles.findOwnedForUpdate(mediaFileId, userId).orElseThrow(MediaFileNotFoundException::new);
		validateCategory(mediaFile.getLibraryCategory());
		if (library.insertIfAbsent(diaryId, mediaFileId, userId, mediaFile.getLibraryCategory().name()) == 0) {
			throw SharedMediaLibraryException.duplicate();
		}
		return SharedMediaLibraryItemResponse.from(library.findByDiaryIdAndMediaFileId(diaryId, mediaFileId)
			.orElseThrow(SharedMediaLibraryException::notFound), mediaFile);
	}

	@Transactional(readOnly = true)
	public SharedMediaLibraryListResponse list(UUID diaryId, Long userId, int limit, String encodedCursor) {
		diaryAccess.requireRead(diaryId, userId);
		MediaListCursor.requireValidLimit(limit);
		MediaListCursor cursor = MediaListCursor.decode(encodedCursor);
		PageRequest pageRequest = PageRequest.of(0, limit + 1);
		List<DiaryMediaLibrary> candidates = cursor == null ? library.findFirstActivePage(diaryId, pageRequest)
			: library.findActivePageAfter(diaryId, cursor.createdAt(), cursor.mediaFileId(), pageRequest);
		boolean hasNext = candidates.size() > limit;
		List<DiaryMediaLibrary> entries = hasNext ? candidates.subList(0, limit) : candidates;
		if (entries.isEmpty()) return new SharedMediaLibraryListResponse(List.of(), null);
		Map<UUID, MediaFile> mediaById = mediaFiles.findAllByMediaFileIdInAndDeletedAtIsNull(entries.stream()
			.map(DiaryMediaLibrary::getMediaFileId).toList()).stream()
			.collect(java.util.stream.Collectors.toMap(MediaFile::getMediaFileId, Function.identity()));
		DiaryMediaLibrary last = entries.get(entries.size() - 1);
		// 페이지 조회와 원본 조회 사이에 삭제된 항목은 건너뛴다. 커서는 공유 항목 기준이라 다음 페이지에 영향이 없다.
		return new SharedMediaLibraryListResponse(entries.stream()
			.map(entry -> {
				MediaFile mediaFile = mediaById.get(entry.getMediaFileId());
				return mediaFile == null ? null : SharedMediaLibraryItemResponse.from(entry, mediaFile);
			})
			.filter(java.util.Objects::nonNull)
			.toList(), hasNext ? MediaListCursor.encode(last.getCreatedAt(), last.getMediaFileId()) : null);
	}

	@Transactional
	public void delete(UUID diaryId, UUID mediaFileId, Long userId) {
		// 원본 소유자는 다이어리에서 나갔거나 VIEWER가 됐거나 다이어리가 삭제돼도 자기 미디어의 공유 연결을 해제할 수 있다.
		// 그렇지 않으면 공유 중이라는 이유로 원본 삭제가 영구히 막힌다.
		if (!mediaFiles.existsByMediaFileIdAndOwnerUserId(mediaFileId, userId)) diaryAccess.requireWrite(diaryId, userId);
		if (library.deleteByDiaryIdAndMediaFileId(diaryId, mediaFileId) == 0) throw SharedMediaLibraryException.notFound();
	}

	private static void validateCategory(MediaLibraryCategory category) {
		if (category != MediaLibraryCategory.STICKER && category != MediaLibraryCategory.TAPE && category != MediaLibraryCategory.DOCUMENT) {
			throw SharedMediaLibraryException.unsupportedCategory();
		}
	}
}
