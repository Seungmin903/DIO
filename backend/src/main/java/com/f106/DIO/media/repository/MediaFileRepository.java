package com.f106.DIO.media.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.media.domain.MediaFile;

public interface MediaFileRepository extends JpaRepository<MediaFile, UUID> {
	Optional<MediaFile> findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(UUID mediaFileId, Long ownerUserId);
	@Query("""
		select mediaFile from MediaFile mediaFile
		where mediaFile.ownerUserId = :ownerUserId and mediaFile.deletedAt is null
		order by mediaFile.createdAt desc, mediaFile.mediaFileId desc
		""")
	List<MediaFile> findFirstActivePage(@Param("ownerUserId") Long ownerUserId, Pageable pageable);
	@Query("""
		select mediaFile from MediaFile mediaFile
		where mediaFile.ownerUserId = :ownerUserId and mediaFile.deletedAt is null
		  and (mediaFile.createdAt < :createdAt
		       or (mediaFile.createdAt = :createdAt and mediaFile.mediaFileId < :mediaFileId))
		order by mediaFile.createdAt desc, mediaFile.mediaFileId desc
		""")
	List<MediaFile> findActivePageAfter(@Param("ownerUserId") Long ownerUserId, @Param("createdAt") Instant createdAt,
		@Param("mediaFileId") UUID mediaFileId, Pageable pageable);

	@Query(value = """
		select media_file.* from media_files media_file
		where media_file.deleted_at <= :cutoff
		  and not exists (select 1 from canvas_elements element where element.media_file_id = media_file.media_file_id)
		  and not exists (select 1 from diary_handwriting_fonts font where font.font_media_file_id = media_file.media_file_id)
		  and not exists (select 1 from diary_media_library library where library.media_file_id = media_file.media_file_id)
		  and not exists (select 1 from ai_jobs job where job.source_media_file_id = media_file.media_file_id or job.result_media_file_id = media_file.media_file_id)
		  and not exists (select 1 from media_files derived where derived.source_media_file_id = media_file.media_file_id)
		order by media_file.deleted_at, media_file.media_file_id
		""", nativeQuery = true)
	List<MediaFile> findPhysicallyDeletable(@Param("cutoff") Instant cutoff, Pageable pageable);

	@Modifying
	@Transactional
	@Query(value = """
		delete from media_files
		where media_file_id = :mediaFileId and deleted_at <= :cutoff
		  and not exists (select 1 from canvas_elements element where element.media_file_id = media_files.media_file_id)
		  and not exists (select 1 from diary_handwriting_fonts font where font.font_media_file_id = media_files.media_file_id)
		  and not exists (select 1 from diary_media_library library where library.media_file_id = media_files.media_file_id)
		  and not exists (select 1 from ai_jobs job where job.source_media_file_id = media_files.media_file_id or job.result_media_file_id = media_files.media_file_id)
		  and not exists (select 1 from media_files derived where derived.source_media_file_id = media_files.media_file_id)
		""", nativeQuery = true)
	int deletePhysicallyIfDeletable(@Param("mediaFileId") UUID mediaFileId, @Param("cutoff") Instant cutoff);
}
