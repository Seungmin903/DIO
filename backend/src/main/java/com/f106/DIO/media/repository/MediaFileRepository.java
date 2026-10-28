package com.f106.DIO.media.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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
}
