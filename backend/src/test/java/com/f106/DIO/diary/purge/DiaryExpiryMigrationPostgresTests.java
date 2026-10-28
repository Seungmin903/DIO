package com.f106.DIO.diary.purge;

import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DIO_LIST_QUERY_PG",matches="true")
class DiaryExpiryMigrationPostgresTests extends DiaryPurgePostgresFixture {
    @Override void migrate(DriverManagerDataSource source) {
        Flyway.configure().dataSource(source).defaultSchema(schema).target("13").load().migrate();
    }
    @Test void v13ToV18PreservesEveryFixtureRowAndAddsCleanupIndexes() {
        jdbc.update("insert into diary_purge_receipts(diary_id,owner_user_id,completed_at) values(?,1,current_timestamp)",UUID.randomUUID());
        var keys=Map.ofEntries(
            Map.entry("diary_purge_receipts","diary_id"),Map.entry("users","user_id"),Map.entry("diaries","diary_id"),Map.entry("pages","page_id"),
            Map.entry("page_templates","template_id"),Map.entry("media_files","media_file_id"),
            Map.entry("canvas_elements","element_id"),Map.entry("element_strokes","element_id"),
            Map.entry("canvas_history_operations","operation_id"),Map.entry("diary_members","diary_id,user_id"),
            Map.entry("diary_invites","invite_id"),Map.entry("diary_media_library","diary_id,media_file_id"),
            Map.entry("diary_handwriting_fonts","diary_id,font_media_file_id"),Map.entry("ai_jobs","ai_job_id"),
            Map.entry("notifications","notification_id"),Map.entry("diary_creation_receipts","user_id,key_hash"));
        var before=new HashMap<String,List<String>>();keys.forEach((table,key)->before.put(table,snapshot(table,key)));
        var result=Flyway.configure().dataSource(jdbc.getDataSource()).defaultSchema(schema).load().migrate();
        assertThat(result.migrationsExecuted).isEqualTo(5);
        keys.forEach((table,key)->assertThat(snapshot(table,key)).as(table+" rows preserved").isEqualTo(before.get(table)));
        assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname=? and indexname='diaries_expiry_cleanup_idx'",Long.class,schema)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname=? and indexname='idx_media_files_deleted_at'",Long.class,schema)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema=? and table_name='media_storage_deletion_queue'",Long.class,schema)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema=? and table_name='media_storage_deletion_queue' and column_name='next_attempt_at'",Long.class,schema)).isEqualTo(1);
        assertThat(Flyway.configure().dataSource(jdbc.getDataSource()).defaultSchema(schema).load().migrate().migrationsExecuted).isZero();
    }
}
