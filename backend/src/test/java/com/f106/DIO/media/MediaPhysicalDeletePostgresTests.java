package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
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

import com.f106.DIO.media.repository.MediaFileRepository;

/**
 * 미디어 물리 삭제 네이티브 SQL을 Flyway로 만든 실제 PostgreSQL 스키마에서 실행한다.
 * 저장소와 같은 SQL 상수를 써서 컬럼명 오타나 참조 조건 누락을 배치 활성화 전에 잡는다.
 */
@EnabledIfEnvironmentVariable(named = "DIO_MEMBER_PURGE_PG", matches = "true")
class MediaPhysicalDeletePostgresTests {
	private static final String SELECT = "select media_files.media_file_id from media_files where "
		+ MediaFileRepository.PHYSICALLY_DELETABLE;
	private static final String DELETE = "delete from media_files where media_files.media_file_id = :mediaFileId and "
		+ MediaFileRepository.PHYSICALLY_DELETABLE;

	private final Instant now = Instant.parse("2026-10-29T00:00:00Z");
	private final Instant cutoff = now.minusSeconds(86_400);
	private final UUID diary = UUID.randomUUID(), page = UUID.randomUUID();
	private final UUID expiredFree = UUID.randomUUID(), expiredFree2 = UUID.randomUUID();
	private final UUID recentlyDeleted = UUID.randomUUID(), active = UUID.randomUUID();
	private final UUID canvas = UUID.randomUUID(), font = UUID.randomUUID(), library = UUID.randomUUID();
	private final UUID aiSource = UUID.randomUUID(), aiResult = UUID.randomUUID(), derivedSource = UUID.randomUUID(), memberPhoto = UUID.randomUUID();
	private final UUID stripCell=UUID.randomUUID(), historyOnly=UUID.randomUUID(), pdfSource=UUID.randomUUID();
	private JdbcTemplate admin, jdbc;
	private NamedParameterJdbcTemplate named;
	private String schema;

	@BeforeEach
	void setup() {
		String url = System.getenv("DB_URL"), user = System.getenv("POSTGRES_USER"), password = System.getenv("POSTGRES_PASSWORD");
		if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_trash_qa"))
			throw new IllegalStateException("Dedicated loopback dio_trash_qa required");
		admin = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
		schema = "media_qa_" + UUID.randomUUID().toString().replace("-", "");
		admin.execute("create schema " + schema);
		DriverManagerDataSource source = new DriverManagerDataSource(url + "?currentSchema=" + schema, user, password);
		jdbc = new JdbcTemplate(source);
		named = new NamedParameterJdbcTemplate(jdbc);
		Flyway.configure().dataSource(source).defaultSchema(schema).load().migrate();

		jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'member1','member1')");
		jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,1,'owned')", diary);
		jdbc.update("insert into pages(page_id,diary_id,sort_key) values(?,?,1)", page, diary);
		Instant expired = now.minusSeconds(2 * 86_400);
		for (UUID id : List.of(expiredFree, expiredFree2, canvas, font, library, aiSource, aiResult, derivedSource, memberPhoto, stripCell, historyOnly))
			media(id, expired, null);
		media(pdfSource, expired, null, "DOCUMENT", "application/pdf");
		media(recentlyDeleted, now.minusSeconds(3_600), null);
		media(active, null, derivedSource);
		jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,media_file_id) values(?,?,'PHOTO',1,0,0,100,100,?)",
			UUID.randomUUID(), page, canvas);
		jdbc.update("insert into diary_handwriting_fonts(diary_id,font_media_file_id,granted_by_user_id) values(?,?,1)", diary, font);
		jdbc.update("insert into diary_media_library(diary_id,media_file_id,added_by_user_id,library_category) values(?,?,1,'STICKER')", diary, library);
		jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,member_profile_photo_id) values(?,1,'OWNER','#6F9FC6',?)",diary,memberPhoto);
		jdbc.update("insert into ai_jobs(source_media_file_id,result_media_file_id,status) values(?,?,'PROCESSING')", aiSource, aiResult);
        jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,properties_json) values(?,?,'PHOTO',2,0,0,10,10,cast(? as jsonb))",UUID.randomUUID(),page,"{\"cells\":[{\"mediaFileId\":\""+stripCell.toString().toUpperCase(java.util.Locale.ROOT)+"\"}]}");
        jdbc.update("insert into canvas_history_operations(page_id,actor_user_id,client_operation_id,operation_type,before_state_json,after_state_json) values(?,1,?,'UPDATE','{}',cast(? as jsonb))",page,UUID.randomUUID(),"{\"mediaFileId\":\""+historyOnly+"\"}");
		jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,properties_json) values(?,?,'PHOTO',3,0,0,10,10,cast(? as jsonb))",UUID.randomUUID(),page,"{\"pdfSource\":{\"mediaFileId\":\""+pdfSource+"\",\"pageIndex\":0,\"edge\":3000}}");

	}

	@AfterEach
	void dropSchema() {
		if (schema != null && schema.matches("media_qa_[0-9a-f]{32}")) admin.execute("drop schema " + schema + " cascade");
	}

	@Test
	void onlyExpiredUnreferencedMediaIsSelectedAndDeleted() {
		List<UUID> deletable = named.queryForList(SELECT + MediaFileRepository.DELETABLE_ORDER,
			Map.of("cutoff", Timestamp.from(cutoff)), UUID.class);
		assertThat(deletable).containsExactlyInAnyOrder(expiredFree, expiredFree2);

		for (UUID referenced : List.of(canvas, font, library, aiSource, aiResult, derivedSource, stripCell, historyOnly, pdfSource, recentlyDeleted, active))
			assertThat(delete(referenced)).as("%s must stay", referenced).isZero();
		assertThat(delete(expiredFree)).isEqualTo(1);
		assertThat(count(expiredFree)).isZero();
		assertThat(count(canvas)).isEqualTo(1);
	}

	@Test
	void cursorSkipsCandidatesAlreadySeenInThisRun() {
		List<UUID> ordered = named.queryForList(SELECT + MediaFileRepository.DELETABLE_ORDER,
			Map.of("cutoff", Timestamp.from(cutoff)), UUID.class);
		UUID first = ordered.get(0);
		Timestamp firstDeletedAt = jdbc.queryForObject("select deleted_at from media_files where media_file_id=?", Timestamp.class, first);

		List<UUID> after = named.queryForList(SELECT + MediaFileRepository.DELETABLE_AFTER + MediaFileRepository.DELETABLE_ORDER,
			Map.of("cutoff", Timestamp.from(cutoff), "afterDeletedAt", firstDeletedAt, "afterMediaFileId", first), UUID.class);
		assertThat(after).containsExactly(ordered.get(1));
	}

    @Test
    void largeUnrelatedHistoryDoesNotChangeDeletionResults() {
        seedUnrelatedHistory();
        assertThat(named.queryForList(SELECT,Map.of("cutoff",Timestamp.from(cutoff)),UUID.class)).containsExactlyInAnyOrder(expiredFree,expiredFree2);
    }

    @Test
    @EnabledIfEnvironmentVariable(named="DIO_MEDIA_EXPLAIN_QA",matches="true")
    void optionalDiagnosticChecksIndexAvailabilityWithoutPlannerCostAssumptions() throws Exception {
        seedUnrelatedHistory();
        var manager=new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource());
        var output=new StringBuilder();
        new org.springframework.transaction.support.TransactionTemplate(manager).executeWithoutResult(tx->{
            jdbc.execute("set local enable_seqscan=off");
            for(var index:List.of(
                new String[]{"canvas_elements","properties_json","idx_canvas_elements_json_media_refs"},
                new String[]{"canvas_history_operations","before_state_json","idx_canvas_history_before_media_refs"},
                new String[]{"canvas_history_operations","after_state_json","idx_canvas_history_after_media_refs"})){
                String sql="explain select * from "+index[0]+" where "+com.f106.DIO.media.repository.MediaReferenceSql.jsonIds(index[1])+" @> jsonb_build_array(cast(? as text))";
                String plan=String.join("\n",jdbc.queryForList(sql,String.class,stripCell.toString()));
                assertThat(plan).contains(index[2]);output.append(plan).append("\n");
            }
        });
        // Optional human diagnostic only: regular CI asserts results and never writes a plan artifact.
        java.nio.file.Files.createDirectories(java.nio.file.Path.of("build"));
        java.nio.file.Files.writeString(java.nio.file.Path.of("build/media-reference-explain.txt"),output.toString());
    }

    private void seedUnrelatedHistory(){
        jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,properties_json) select gen_random_uuid(),?,'PHOTO',100+n,0,0,10,10,jsonb_build_object('cells',jsonb_build_array(jsonb_build_object('mediaFileId',gen_random_uuid()::text)),'text',repeat('x',200)) from generate_series(1,10000) n",page);
        jdbc.update("insert into canvas_history_operations(page_id,actor_user_id,client_operation_id,operation_type,before_state_json,after_state_json) select ?,1,gen_random_uuid(),'UPDATE',jsonb_build_object('elements',jsonb_build_object(n::text,jsonb_build_object('mediaFileId',gen_random_uuid()::text))),jsonb_build_object('elements',jsonb_build_object(n::text,jsonb_build_object('propertiesJson',jsonb_build_object('cells',jsonb_build_array(jsonb_build_object('mediaFileId',gen_random_uuid()::text)))))) from generate_series(1,10000) n",page);
        jdbc.execute("analyze canvas_elements");jdbc.execute("analyze canvas_history_operations");jdbc.execute("analyze media_files");
    }

	private void media(UUID id, Instant deletedAt, UUID source) {
		media(id, deletedAt, source, "IMAGE", "image/png");
	}
	private void media(UUID id, Instant deletedAt, UUID source, String mediaType, String mimeType) {
		jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,storage_key,mime_type,file_size,status,source_media_file_id,deleted_at) values(?,1,?,?,?,1,'READY',?,?)",
			id, mediaType, "test/" + id, mimeType, source, deletedAt == null ? null : Timestamp.from(deletedAt));
	}

	private int delete(UUID id) {
		return named.update(DELETE, Map.of("mediaFileId", id, "cutoff", Timestamp.from(cutoff)));
	}

	private long count(UUID id) {
		return jdbc.queryForObject("select count(*) from media_files where media_file_id=?", Long.class, id);
	}
}
