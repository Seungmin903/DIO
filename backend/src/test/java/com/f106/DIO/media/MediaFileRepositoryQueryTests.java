package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.repository.MediaFileRepository;

/** Runs repository JPQL against PostgreSQL-compatible H2, including the cursor branch. */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:media-personal-library;MODE=PostgreSQL;DB_CLOSE_DELAY=-1")
@ActiveProfiles("test")
class MediaFileRepositoryQueryTests {
	@Autowired MediaFileRepository mediaFiles;
	@Autowired JdbcTemplate jdbc;

	@Test @Transactional
	void excludesDocumentsFromTheFirstAndCursorPages() {
		long owner = 8_800_001L;
		jdbc.update("insert into users(user_id,nickname,nickname_key,profile_color,status,created_at,updated_at) values(?,?,?,'#123456','ACTIVE',current_timestamp,current_timestamp)", owner, "library-owner", "library-owner");
		Instant middleCreatedAt = Instant.parse("2026-11-02T00:00:03Z");
		MediaFile oldest = save(owner, MediaType.IMAGE, MediaLibraryCategory.PHOTO, "oldest.png", Instant.parse("2026-11-02T00:00:01Z"));
		save(owner, MediaType.DOCUMENT, MediaLibraryCategory.DOCUMENT, "source-a.pdf", Instant.parse("2026-11-02T00:00:02Z"));
		MediaFile middle = save(owner, MediaType.IMAGE, MediaLibraryCategory.PHOTO, "middle.png", middleCreatedAt);
		save(owner, MediaType.DOCUMENT, MediaLibraryCategory.DOCUMENT, "source-b.pdf", Instant.parse("2026-11-02T00:00:04Z"));
		MediaFile newest = save(owner, MediaType.IMAGE, MediaLibraryCategory.PHOTO, "newest.png", Instant.parse("2026-11-02T00:00:05Z"));

		var first = mediaFiles.findFirstActivePage(owner, PageRequest.of(0, 2));
		assertThat(first).extracting(MediaFile::getMediaFileId).containsExactly(newest.getMediaFileId(), middle.getMediaFileId());

		var next = mediaFiles.findActivePageAfter(owner, middleCreatedAt, middle.getMediaFileId(), PageRequest.of(0, 2));
		assertThat(next).extracting(MediaFile::getMediaFileId).containsExactly(oldest.getMediaFileId());
	}

	private MediaFile save(long owner, MediaType type, MediaLibraryCategory category, String name, Instant createdAt) {
		UUID id = UUID.randomUUID();
		String extension = type == MediaType.DOCUMENT ? "pdf" : "png";
		MediaFile media = mediaFiles.saveAndFlush(new MediaFile(id, owner, type, category,
			"media/" + type.name().toLowerCase() + "/2026/11/" + id + "." + extension, name,
			type == MediaType.DOCUMENT ? "application/pdf" : "image/png", 1, "0".repeat(64)));
		jdbc.update("update media_files set created_at=? where media_file_id=?", createdAt, id);
		return mediaFiles.findById(media.getMediaFileId()).orElseThrow();
	}
}
