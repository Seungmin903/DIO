package com.f106.DIO.media.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.media.domain.MediaFile;

public interface MediaFileRepository extends JpaRepository<MediaFile, UUID> {
	/**
	 * 보존 기간이 지났고 어느 테이블에서도 참조하지 않는 미디어 조건. 조회와 조건부 삭제가 같은 문자열을 써서
	 * 두 쿼리의 판단이 어긋나지 않게 하고, PostgreSQL 통합 테스트도 이 문자열을 그대로 실행한다.
	 */
	String PHYSICALLY_DELETABLE = "media_files.deleted_at <= :cutoff " + MediaReferenceSql.UNREFERENCED;
	String DELETABLE_ORDER = " order by media_files.deleted_at, media_files.media_file_id";
	String DELETABLE_AFTER = " and (media_files.deleted_at, media_files.media_file_id) > (:afterDeletedAt, :afterMediaFileId)";

	/**
	 * 활성 다이어리나 아직 복원할 수 있는 휴지통 다이어리의 공유 보관함에 남아 있는지.
	 * 휴지통 다이어리를 복원했을 때 공유한 스티커·테이프가 사라져 있지 않도록 복원 기간 동안 원본 삭제를 막는다.
	 * 복원 기간이 지난 다이어리의 연결은 물리 삭제 때 함께 지워지므로 세지 않는다.
	 */
	String EXISTS_IN_RESTORABLE_SHARED_LIBRARY = "select exists (select 1 from diary_media_library library "
		+ "join diaries diary on diary.diary_id = library.diary_id "
		+ "where library.media_file_id = :mediaFileId "
		+ "and (diary.deleted_at is null or diary.deleted_at > :restorableSince))";

	Optional<MediaFile> findByMediaFileIdAndOwnerUserIdAndDeletedAtIsNull(UUID mediaFileId, Long ownerUserId);
	Optional<MediaFile> findByMediaFileIdAndDeletedAtIsNull(UUID mediaFileId);
	/**
	 * 본인이 미디어에서 지웠어도(삭제 표시) 내 꾸미기 공방 보관함에 아직 든 이미지. 보관함 API 는 이런 이미지를 그대로 두게 허용하므로,
	 * 다른 기기 · 재설치 기기가 보관함을 받을 때 파일을 내려받을 수 있어야 한다. 보관함에서 빠지면 다시 찾을 수 없다.
	 */
	@Query(value = "select * from media_files where media_file_id = :mediaFileId and owner_user_id = :ownerUserId and status = 'READY' and media_type = 'IMAGE' "
		+ "and (exists (select 1 from user_sticker_library_media kept where kept.user_id = :ownerUserId and kept.media_file_id = media_files.media_file_id) or exists (select 1 from user_tape_library_media kept where kept.user_id = :ownerUserId and kept.media_file_id = media_files.media_file_id))", nativeQuery = true)
	Optional<MediaFile> findKeptInPersonalLibrary(@Param("mediaFileId") UUID mediaFileId, @Param("ownerUserId") Long ownerUserId);
	List<MediaFile> findAllByMediaFileIdInAndDeletedAtIsNull(Collection<UUID> mediaFileIds);
	boolean existsByMediaFileIdAndOwnerUserId(UUID mediaFileId, Long ownerUserId);
	@Query(value = EXISTS_IN_RESTORABLE_SHARED_LIBRARY, nativeQuery = true)
	boolean existsInSharedLibrary(@Param("mediaFileId") UUID mediaFileId, @Param("restorableSince") Instant restorableSince);

	/** 공유 보관함 추가와 원본 삭제가 같은 행을 잠가, 동시에 일어나도 삭제된 미디어의 공유 연결이 남지 않게 한다. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
		select mediaFile from MediaFile mediaFile
		where mediaFile.mediaFileId = :mediaFileId and mediaFile.ownerUserId = :ownerUserId and mediaFile.deletedAt is null
		""")
	Optional<MediaFile> findOwnedForUpdate(@Param("mediaFileId") UUID mediaFileId, @Param("ownerUserId") Long ownerUserId);
	@Query("""
		select mediaFile from MediaFile mediaFile
		where mediaFile.ownerUserId = :ownerUserId and mediaFile.deletedAt is null and mediaFile.mediaType <> com.f106.DIO.media.domain.MediaType.DOCUMENT
		order by mediaFile.createdAt desc, mediaFile.mediaFileId desc
		""")
	List<MediaFile> findFirstActivePage(@Param("ownerUserId") Long ownerUserId, Pageable pageable);
	@Query("""
		select mediaFile from MediaFile mediaFile
		where mediaFile.ownerUserId = :ownerUserId and mediaFile.deletedAt is null and mediaFile.mediaType <> com.f106.DIO.media.domain.MediaType.DOCUMENT
		  and (mediaFile.createdAt < :createdAt
		       or (mediaFile.createdAt = :createdAt and mediaFile.mediaFileId < :mediaFileId))
		order by mediaFile.createdAt desc, mediaFile.mediaFileId desc
		""")
	List<MediaFile> findActivePageAfter(@Param("ownerUserId") Long ownerUserId, @Param("createdAt") Instant createdAt,
		@Param("mediaFileId") UUID mediaFileId, Pageable pageable);

	@Query(value = "select media_files.* from media_files where " + PHYSICALLY_DELETABLE + DELETABLE_ORDER, nativeQuery = true)
	List<MediaFile> findPhysicallyDeletable(@Param("cutoff") Instant cutoff, Pageable pageable);

	/** 삭제에 계속 실패하는 행에 막히지 않도록 마지막으로 본 후보 다음부터 조회한다. */
	@Query(value = "select media_files.* from media_files where " + PHYSICALLY_DELETABLE
		+ DELETABLE_AFTER + DELETABLE_ORDER,
		nativeQuery = true)
	List<MediaFile> findPhysicallyDeletableAfter(@Param("cutoff") Instant cutoff, @Param("afterDeletedAt") Instant afterDeletedAt,
		@Param("afterMediaFileId") UUID afterMediaFileId, Pageable pageable);

	@Modifying
	@Transactional
	@Query(value = "delete from media_files where media_files.media_file_id = :mediaFileId and " + PHYSICALLY_DELETABLE,
		nativeQuery = true)
	int deletePhysicallyIfDeletable(@Param("mediaFileId") UUID mediaFileId, @Param("cutoff") Instant cutoff);
}
