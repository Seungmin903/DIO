package com.f106.DIO.media.library.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import com.f106.DIO.media.domain.MediaLibraryCategory;

@Entity
@Table(name = "diary_media_library")
@IdClass(DiaryMediaLibraryId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DiaryMediaLibrary {
	@Id @Column(name = "diary_id", nullable = false) private UUID diaryId;
	@Id @Column(name = "media_file_id", nullable = false) private UUID mediaFileId;
	@Column(name = "added_by_user_id", nullable = false) private Long addedByUserId;
	@Enumerated(EnumType.STRING) @Column(name = "library_category", nullable = false, length = 20)
	private MediaLibraryCategory libraryCategory;
	@Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;

	public DiaryMediaLibrary(UUID diaryId, UUID mediaFileId, Long addedByUserId, MediaLibraryCategory libraryCategory) {
		this.diaryId = diaryId;
		this.mediaFileId = mediaFileId;
		this.addedByUserId = addedByUserId;
		this.libraryCategory = libraryCategory;
		this.createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
	}
}
