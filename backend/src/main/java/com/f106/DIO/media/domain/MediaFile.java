package com.f106.DIO.media.domain;

import java.sql.Types;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;

@Entity
@Table(name = "media_files")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MediaFile {
	@Id
	@Column(name = "media_file_id", nullable = false)
	private UUID mediaFileId;
	@Column(name = "owner_user_id")
	private Long ownerUserId;
	@Enumerated(EnumType.STRING)
	@Column(name = "media_type", nullable = false, length = 20)
	private MediaType mediaType;
	@Enumerated(EnumType.STRING)
	@Column(name = "source_type", nullable = false, length = 20)
	private MediaSourceType sourceType;
	@Enumerated(EnumType.STRING)
	@Column(name = "library_category", nullable = false, length = 20)
	private MediaLibraryCategory libraryCategory;
	@Column(name = "storage_key", nullable = false, length = 500)
	private String storageKey;
	@Column(name = "original_filename", length = 255)
	private String originalFilename;
	@Column(name = "mime_type", nullable = false, length = 100)
	private String mimeType;
	@Column(name = "file_size", nullable = false)
	private long fileSize;
	@JdbcTypeCode(Types.CHAR)
	@Column(name = "checksum_sha256", columnDefinition = "char(64)")
	private String checksumSha256;
	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private MediaStatus status;
	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;
	@Column(name = "deleted_at")
	private Instant deletedAt;

	public MediaFile(UUID mediaFileId, Long ownerUserId, MediaType mediaType, MediaLibraryCategory libraryCategory,
			String storageKey, String originalFilename, String mimeType, long fileSize, String checksumSha256) {
		this(mediaFileId, ownerUserId, mediaType, MediaSourceType.UPLOAD, libraryCategory, storageKey, originalFilename, mimeType, fileSize, checksumSha256);
	}
	public MediaFile(UUID mediaFileId, Long ownerUserId, MediaType mediaType, MediaSourceType sourceType, MediaLibraryCategory libraryCategory,
			String storageKey, String originalFilename, String mimeType, long fileSize, String checksumSha256) {
		this.mediaFileId = mediaFileId;
		this.ownerUserId = ownerUserId;
		this.mediaType = mediaType;
		this.sourceType = sourceType;
		this.libraryCategory = libraryCategory;
		this.storageKey = storageKey;
		this.originalFilename = originalFilename;
		this.mimeType = mimeType;
		this.fileSize = fileSize;
		this.checksumSha256 = checksumSha256;
		this.status = MediaStatus.READY;
		this.createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
	}
	public void softDelete() { deletedAt = Instant.now().truncatedTo(ChronoUnit.MICROS); }
}
