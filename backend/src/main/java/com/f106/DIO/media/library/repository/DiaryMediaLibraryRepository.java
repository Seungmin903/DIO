package com.f106.DIO.media.library.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.f106.DIO.media.library.domain.DiaryMediaLibrary;
import com.f106.DIO.media.library.domain.DiaryMediaLibraryId;

public interface DiaryMediaLibraryRepository extends JpaRepository<DiaryMediaLibrary, DiaryMediaLibraryId> {
	/** 네이티브 SQL은 PostgreSQL 통합 테스트가 같은 문자열을 실행해 스키마와 맞는지 확인한다. */
	String INSERT_IF_ABSENT = "insert into diary_media_library(diary_id, media_file_id, added_by_user_id, library_category) "
		+ "values (:diaryId, :mediaFileId, :addedByUserId, :libraryCategory) on conflict (diary_id, media_file_id) do nothing";
	String READABLE_BY_MEMBER = "select exists (select 1 from diary_media_library library join diaries diary on diary.diary_id = library.diary_id "
		+ "left join diary_members member on member.diary_id = diary.diary_id and member.user_id = :userId and member.left_at is null "
		+ "where library.media_file_id = :mediaFileId and diary.deleted_at is null "
		+ "and (diary.owner_user_id = :userId or member.user_id is not null))";

	/** 삭제된 원본은 쿼리에서 빼서, 한 페이지가 삭제 항목 때문에 비거나 짧아지지 않게 한다. */
	@Query("""
		select library from DiaryMediaLibrary library
		where library.diaryId = :diaryId
		  and exists (select 1 from MediaFile media where media.mediaFileId = library.mediaFileId and media.deletedAt is null)
		order by library.createdAt desc, library.mediaFileId desc
		""")
	List<DiaryMediaLibrary> findFirstActivePage(@Param("diaryId") UUID diaryId, Pageable pageable);
	@Query("""
		select library from DiaryMediaLibrary library
		where library.diaryId = :diaryId
		  and exists (select 1 from MediaFile media where media.mediaFileId = library.mediaFileId and media.deletedAt is null)
		  and (library.createdAt < :createdAt or (library.createdAt = :createdAt and library.mediaFileId < :mediaFileId))
		order by library.createdAt desc, library.mediaFileId desc
		""")
	List<DiaryMediaLibrary> findActivePageAfter(@Param("diaryId") UUID diaryId, @Param("createdAt") Instant createdAt,
		@Param("mediaFileId") UUID mediaFileId, Pageable pageable);
	Optional<DiaryMediaLibrary> findByDiaryIdAndMediaFileId(UUID diaryId, UUID mediaFileId);
	@Modifying
	@Query(value = INSERT_IF_ABSENT, nativeQuery = true)
	int insertIfAbsent(@Param("diaryId") UUID diaryId, @Param("mediaFileId") UUID mediaFileId,
		@Param("addedByUserId") Long addedByUserId, @Param("libraryCategory") String libraryCategory);

	@Modifying
	@Query("delete from DiaryMediaLibrary library where library.diaryId = :diaryId and library.mediaFileId = :mediaFileId")
	int deleteByDiaryIdAndMediaFileId(@Param("diaryId") UUID diaryId, @Param("mediaFileId") UUID mediaFileId);

	@Query(value = READABLE_BY_MEMBER, nativeQuery = true)
	boolean isReadableByMember(@Param("mediaFileId") UUID mediaFileId, @Param("userId") Long userId);
}
