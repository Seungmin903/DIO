package com.f106.DIO.media.library.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.f106.DIO.media.library.domain.DiaryMediaLibrary;
import com.f106.DIO.media.library.domain.DiaryMediaLibraryId;

public interface DiaryMediaLibraryRepository extends JpaRepository<DiaryMediaLibrary, DiaryMediaLibraryId> {
	List<DiaryMediaLibrary> findAllByDiaryIdOrderByCreatedAtDescMediaFileIdDesc(UUID diaryId);
	Optional<DiaryMediaLibrary> findByDiaryIdAndMediaFileId(UUID diaryId, UUID mediaFileId);
	@Modifying
	@Query(value = "insert into diary_media_library(diary_id, media_file_id, added_by_user_id, library_category) "
		+ "values (:diaryId, :mediaFileId, :addedByUserId, :libraryCategory) on conflict (diary_id, media_file_id) do nothing", nativeQuery = true)
	int insertIfAbsent(@Param("diaryId") UUID diaryId, @Param("mediaFileId") UUID mediaFileId,
		@Param("addedByUserId") Long addedByUserId, @Param("libraryCategory") String libraryCategory);

	@Modifying
	@Query("delete from DiaryMediaLibrary library where library.diaryId = :diaryId and library.mediaFileId = :mediaFileId")
	int deleteByDiaryIdAndMediaFileId(@Param("diaryId") UUID diaryId, @Param("mediaFileId") UUID mediaFileId);

	@Query(value = "select exists (select 1 from diary_media_library library join diaries diary on diary.diary_id = library.diary_id "
		+ "left join diary_members member on member.diary_id = diary.diary_id and member.user_id = :userId and member.left_at is null "
		+ "where library.media_file_id = :mediaFileId and diary.deleted_at is null "
		+ "and (diary.owner_user_id = :userId or member.user_id is not null))", nativeQuery = true)
	boolean isReadableByMember(@Param("mediaFileId") UUID mediaFileId, @Param("userId") Long userId);
}
