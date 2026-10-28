package com.f106.DIO.media.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.f106.DIO.media.domain.MediaFile;

public interface MediaFileRepository extends JpaRepository<MediaFile, UUID> {
	Optional<MediaFile> findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(UUID mediaFileId, Long ownerUserId);
	List<MediaFile> findAllByOwnerUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(Long ownerUserId);
}
