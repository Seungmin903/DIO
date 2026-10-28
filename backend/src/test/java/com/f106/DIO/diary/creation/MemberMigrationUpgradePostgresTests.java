package com.f106.DIO.diary.creation;

import java.nio.file.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

/** Rehearses only an isolated legacy member schema; never repairs an existing QA database. */
@EnabledIfSystemProperty(named="dio.diary-creation-postgres",matches="true")
class MemberMigrationUpgradePostgresTests {
    @Test void legacyMemberHistoryCanBeRenumberedWithoutChangingMemberData() throws Exception {
        String url=System.getenv("DB_URL"),user=System.getenv("POSTGRES_USER"),password=System.getenv("POSTGRES_PASSWORD");
        if(url==null || !url.startsWith("jdbc:postgresql://127.0.0.1:")) throw new IllegalStateException("Explicit isolated local PostgreSQL URL required");
        var admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));
        String schema="member_upgrade_"+UUID.randomUUID().toString().replace("-","");
        var directory=Files.createTempDirectory(Path.of("build"),"member-legacy-");
        try {
            admin.execute("create schema "+schema);
            var source=Path.of(getClass().getResource("/db/migration").toURI());
            try(var paths=Files.list(source)) {
                for(var path:paths.filter(p -> p.getFileName().toString().matches("V[1-6]__.*\\.sql")).toList()) Files.copy(path,directory.resolve(path.getFileName()));
            }
            Files.copy(source.resolve("V9__seed_page_template_catalog.sql"),directory.resolve("V7__seed_page_template_catalog.sql"));
            Files.copy(source.resolve("V10__create_diary_creation_receipts.sql"),directory.resolve("V8__create_diary_creation_receipts.sql"));
            var ds=new DriverManagerDataSource(url,user,password);
            var props=new Properties();props.setProperty("currentSchema",schema);ds.setConnectionProperties(props);
            var jdbc=new JdbcTemplate(ds);
            Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations("filesystem:"+directory.toAbsolutePath()).load().migrate();
            jdbc.update("insert into users(user_id,nickname,nickname_key) values(101,'legacy','legacy')");
            UUID diary=UUID.randomUUID();
            jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility) values(?,101,'legacy','#123456','PLAIN','PRIVATE')",diary);
            jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,101,'OWNER','#123456')",diary);
            jdbc.update("insert into pages(page_id,diary_id,template_id,template_config,sort_key,canvas_width,canvas_height) select ?,?,template_id,'{}'::jsonb,1,canvas_width,canvas_height from page_templates order by template_id limit 1",UUID.randomUUID(),diary);
            jdbc.update("insert into diary_creation_receipts(user_id,key_hash,request_hash,diary_id,response_body,completed_at) values(101,?,?,?,'{\"legacy\":true}'::jsonb,now())","1".repeat(64),"2".repeat(64),diary);
            var tables=List.of("users","diaries","diary_members","pages","page_templates","diary_creation_receipts");
            var snapshots=new HashMap<String,List<String>>();
            var originalColumns=new HashMap<String,List<String>>();
            for(var table:tables) {
                var columns=jdbc.queryForList("select column_name from information_schema.columns where table_schema=current_schema() and table_name=? order by ordinal_position",String.class,table);
                assertThat(columns).as(table+" original columns").isNotEmpty();
                originalColumns.put(table,columns);
                snapshots.put(table,fingerprint(jdbc,table,columns));
            }
            var current=Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).load();
            assertThatThrownBy(current::validate).isInstanceOf(org.flywaydb.core.api.exception.FlywayValidateException.class);
            assertThat(jdbc.update("update flyway_schema_history set version='9',script='V9__seed_page_template_catalog.sql' where version='7' and script='V7__seed_page_template_catalog.sql' and success")).isEqualTo(1);
            assertThat(jdbc.update("update flyway_schema_history set version='10',script='V10__create_diary_creation_receipts.sql' where version='8' and script='V8__create_diary_creation_receipts.sql' and success")).isEqualTo(1);
            var upgrade=Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).outOfOrder(true).load();
            var expectedVersions=Arrays.stream(upgrade.info().all()).map(info->info.getVersion()).filter(Objects::nonNull)
                .distinct().sorted().map(Object::toString).toList();
            // Known migration files must remain present; later versions may be appended.
            assertThat(expectedVersions).contains("1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19");
            assertThat(Arrays.stream(upgrade.info().pending()).map(info->info.getVersion().toString()).toList())
                .contains("7","8","11","12","13","14","15","16","17","18","19");
            int pending=upgrade.info().pending().length;
            assertThat(pending).isPositive();
            var result=upgrade.migrate();
            assertThat(result.migrationsExecuted).isEqualTo(pending);
            assertThat(jdbc.queryForObject("select version from diaries where diary_id=?",Long.class,diary)).isEqualTo(2L);
            current.validate();
            assertThat(current.migrate().migrationsExecuted).isZero();
            for(var table:tables) assertThat(fingerprint(jdbc,table,originalColumns.get(table))).as(table).isEqualTo(snapshots.get(table));
            assertThat(jdbc.queryForList("select version from flyway_schema_history where success order by version::integer",String.class)).containsExactlyElementsOf(expectedVersions);
            assertThat(jdbc.queryForObject("select count(*) from diary_purge_receipts",Long.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname=? and indexname='pages_active_diary_idx'",Long.class,schema)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema=? and table_name='password_reset_verifications'",Long.class,schema)).isEqualTo(1);
        } finally {
            if(schema.matches("member_upgrade_[0-9a-f]{32}")) admin.execute("drop schema if exists "+schema+" cascade");
            try(var paths=Files.walk(directory)) { for(var path:paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path); }
        }
    }
    private static java.util.List<String> fingerprint(JdbcTemplate jdbc,String table,List<String> columns) {
        // Compare every pre-upgrade value without treating approved new nullable columns as data changes.
        String projection="jsonb_build_array("+columns.stream().map(column->"t.\""+column.replace("\"","\"\"")+"\"")
            .collect(java.util.stream.Collectors.joining(","))+")::text";
        return jdbc.queryForList("select "+projection+" from "+table+" t order by "+projection,String.class);
    }
}
