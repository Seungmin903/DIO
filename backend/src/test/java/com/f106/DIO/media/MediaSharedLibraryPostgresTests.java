package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import com.f106.DIO.diary.support.DiaryRetention;
import com.f106.DIO.media.library.repository.DiaryMediaLibraryRepository;
import com.f106.DIO.media.repository.MediaFileRepository;

/** 공유 보관함 네이티브 SQL을 Flyway로 만든 실제 PostgreSQL 스키마에서 저장소와 같은 문자열로 실행한다. */
@EnabledIfEnvironmentVariable(named = "DIO_LIST_QUERY_PG", matches = "true")
class MediaSharedLibraryPostgresTests {
	private static final long OWNER = 1, MEMBER = 2, LEFT_MEMBER = 3, OUTSIDER = 4;
	private final UUID diary = UUID.randomUUID(), deletedDiary = UUID.randomUUID(), expiredDiary = UUID.randomUUID();
	private final UUID sticker = UUID.randomUUID(), onlyInDeletedDiary = UUID.randomUUID(), onlyInExpiredDiary = UUID.randomUUID();
	private JdbcTemplate admin, jdbc;
	private NamedParameterJdbcTemplate named;
	private String schema;

	@BeforeEach
	void setup() {
		String url = System.getenv("DB_URL"), user = System.getenv("POSTGRES_USER"), password = System.getenv("POSTGRES_PASSWORD");
		if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_trash_qa"))
			throw new IllegalStateException("Dedicated loopback dio_trash_qa required");
		admin = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
		schema = "library_qa_" + UUID.randomUUID().toString().replace("-", "");
		admin.execute("create schema " + schema);
		DriverManagerDataSource source = new DriverManagerDataSource(url + "?currentSchema=" + schema, user, password);
		jdbc = new JdbcTemplate(source);
		named = new NamedParameterJdbcTemplate(jdbc);
		Flyway.configure().dataSource(source).defaultSchema(schema).load().migrate();

		for (long id : new long[] {OWNER, MEMBER, LEFT_MEMBER, OUTSIDER})
			jdbc.update("insert into users(user_id,nickname,nickname_key) values(?,?,?)", id, "member" + id, "member" + id);
		jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'shared')", diary, OWNER);
		jdbc.update("insert into diaries(diary_id,owner_user_id,title,deleted_at) values(?,?,'gone',?)", deletedDiary, OWNER, Timestamp.from(Instant.now()));
		jdbc.update("insert into diaries(diary_id,owner_user_id,title,deleted_at) values(?,?,'expired',?)", expiredDiary, OWNER,
			Timestamp.from(Instant.now().minus(DiaryRetention.PERIOD).minusSeconds(60)));
		jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,?,'EDITOR','#123456')", diary, MEMBER);
		jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,left_at) values(?,?,'EDITOR','#123456',?)", diary, LEFT_MEMBER, Timestamp.from(Instant.now()));
		for (UUID media : new UUID[] {sticker, onlyInDeletedDiary, onlyInExpiredDiary})
			jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,library_category,storage_key,mime_type,file_size,status) values(?,?,'IMAGE','STICKER',?,'image/png',1,'READY')",
				media, OWNER, "test/" + media);
	}

	@AfterEach
	void dropSchema() {
		if (schema != null && schema.matches("library_qa_[0-9a-f]{32}")) admin.execute("drop schema " + schema + " cascade");
	}

	@Test
	void insertIfAbsentKeepsTheFirstEntryAndFillsCreatedAt() {
		assertThat(insert(diary, sticker, OWNER)).isEqualTo(1);
		assertThat(insert(diary, sticker, MEMBER)).isZero();

		Map<String, Object> row = jdbc.queryForMap("select added_by_user_id, created_at from diary_media_library where diary_id=? and media_file_id=?", diary, sticker);
		assertThat(((Number) row.get("added_by_user_id")).longValue()).isEqualTo(OWNER);
		assertThat(row.get("created_at")).isNotNull();
	}

	@Test
	void onlyTheDiaryOwnerAndActiveMembersOfAnActiveDiaryCanRead() {
		insert(diary, sticker, OWNER);
		insert(deletedDiary, onlyInDeletedDiary, OWNER);

		assertThat(readable(sticker, OWNER)).isTrue();
		assertThat(readable(sticker, MEMBER)).isTrue();
		assertThat(readable(sticker, LEFT_MEMBER)).isFalse();
		assertThat(readable(sticker, OUTSIDER)).isFalse();
		assertThat(readable(onlyInDeletedDiary, OWNER)).isFalse();
	}

	@Test
	void linksInActiveOrStillRestorableDiariesBlockDeletingTheOriginal() {
		insert(diary, sticker, OWNER);
		insert(deletedDiary, onlyInDeletedDiary, OWNER);
		insert(expiredDiary, onlyInExpiredDiary, OWNER);

		assertThat(sharedInRestorableDiary(sticker)).isTrue();
		assertThat(sharedInRestorableDiary(onlyInDeletedDiary)).as("휴지통에서 복원할 수 있는 다이어리").isTrue();
		assertThat(sharedInRestorableDiary(onlyInExpiredDiary)).as("복원 기간이 지난 다이어리").isFalse();
	}

	private int insert(UUID diaryId, UUID mediaFileId, long addedBy) {
		return named.update(DiaryMediaLibraryRepository.INSERT_IF_ABSENT, Map.of("diaryId", diaryId, "mediaFileId", mediaFileId,
			"addedByUserId", addedBy, "libraryCategory", "STICKER"));
	}

	private boolean readable(UUID mediaFileId, long userId) {
		return named.queryForObject(DiaryMediaLibraryRepository.READABLE_BY_MEMBER, Map.of("mediaFileId", mediaFileId, "userId", userId), Boolean.class);
	}

	private boolean sharedInRestorableDiary(UUID mediaFileId) {
		return named.queryForObject(MediaFileRepository.EXISTS_IN_RESTORABLE_SHARED_LIBRARY, Map.of("mediaFileId", mediaFileId,
			"restorableSince", Timestamp.from(Instant.now().minus(DiaryRetention.PERIOD))), Boolean.class);
	}
}
