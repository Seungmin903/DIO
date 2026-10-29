package com.f106.DIO.support;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * 폐기용 PostgreSQL에서 최신 마이그레이션을 JVM당 한 번만 실행하고, 테스트 사이에는 데이터만 되돌려 같은 스키마를 재사용한다.
 * 테스트마다 Flyway 전체를 다시 돌리던 비용을 없애기 위한 것이며, 마이그레이션 자체를 검증하는 테스트는 쓰지 않는다.
 *
 * <p>되돌리는 범위: 모든 테이블 데이터(flyway_schema_history 제외), 마이그레이션이 넣은 기본 행, 시퀀스 값.
 * 테스트가 제약·인덱스·컬럼 등 구조를 바꾼 채로 끝나면 구조 지문이 달라지므로 스키마를 버리고 새로 마이그레이션한다.
 */
public final class MigratedPostgresSchema {
    private static final Map<String, MigratedPostgresSchema> SCHEMAS = new ConcurrentHashMap<>();

    private final JdbcTemplate admin;
    private final String url, user, password, prefix;
    private String schema, fingerprint, restoreSql;

    private MigratedPostgresSchema(String url, String user, String password, String prefix) {
        this.url = url; this.user = user; this.password = password; this.prefix = prefix;
        admin = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        Runtime.getRuntime().addShutdownHook(new Thread(this::drop));
    }

    /** 마이그레이션 직후와 같은 데이터 상태의 스키마 이름을 돌려준다. 같은 url·접두사는 같은 스키마를 재사용한다. */
    public static String reset(String url, String user, String password, String prefix) {
        if (!prefix.matches("[a-z_]+_")) throw new IllegalArgumentException("Schema prefix must be lowercase and end with _");
        return SCHEMAS.computeIfAbsent(url + "|" + prefix, key -> new MigratedPostgresSchema(url, user, password, prefix)).reset();
    }

    private synchronized String reset() {
        if (schema != null && !fingerprint.equals(fingerprint())) drop();
        if (schema == null) create();
        else admin.execute(restoreSql);
        return schema;
    }

    private void create() {
        schema = prefix + UUID.randomUUID().toString().replace("-", "");
        admin.execute("create schema " + schema);
        var source = new DriverManagerDataSource(url + (url.contains("?") ? "&" : "?") + "currentSchema=" + schema, user, password);
        Flyway.configure().dataSource(source).defaultSchema(schema).load().migrate();
        restoreSql = snapshot();
        fingerprint = fingerprint();
    }

    /** 마이그레이션 직후의 기본 행을 별도 스키마에 복사해 두고, 테스트 사이에 실행할 복원 SQL을 만든다. */
    private String snapshot() {
        String seed = schema + "_seed";
        admin.execute("create schema " + seed);
        List<String> tables = admin.queryForList(
            "select tablename from pg_tables where schemaname=? and tablename<>'flyway_schema_history' order by tablename", String.class, schema);
        var sql = new StringBuilder("truncate table ");
        sql.append(String.join(",", tables.stream().map(table -> schema + "." + table).toList())).append(" cascade;");
        for (String table : tables) {
            Long rows = admin.queryForObject("select count(*) from " + schema + "." + table, Long.class);
            if (rows == null || rows == 0) continue;
            admin.execute("create table " + seed + "." + table + " as select * from " + schema + "." + table);
            sql.append("insert into ").append(schema).append('.').append(table)
                .append(" overriding system value select * from ").append(seed).append('.').append(table).append(';');
        }
        admin.query("select sequencename, last_value from pg_sequences where schemaname=?", rs -> {
            long value = rs.getLong("last_value");
            boolean unused = rs.wasNull();  // 한 번도 쓰지 않은 시퀀스는 last_value가 NULL이다.
            sql.append("select setval('").append(schema).append('.').append(rs.getString("sequencename")).append("',")
                .append(unused ? "1,false" : value + ",true").append(");");
        }, schema);
        return sql.toString();
    }

    /**
     * 제약·인덱스·트리거 정의와 컬럼(타입·NULL 허용·기본값)을 정렬해 만든 구조 지문.
     * 개수만 세면 같은 수로 지우고 다시 만든 변경을 놓치므로 정의 전체의 해시를 비교한다.
     */
    private String fingerprint() {
        return admin.queryForObject("""
            select md5(concat_ws('|',
              (select string_agg(r.relname || ':' || c.conname || ':' || pg_get_constraintdef(c.oid), ',' order by r.relname, c.conname)
                 from pg_constraint c join pg_namespace n on n.oid=c.connamespace left join pg_class r on r.oid=c.conrelid where n.nspname=?),
              (select string_agg(indexdef, ',' order by tablename, indexname) from pg_indexes where schemaname=?),
              (select string_agg(pg_get_triggerdef(t.oid), ',' order by r.relname, t.tgname)
                 from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname=? and not t.tgisinternal),
              (select string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ','
                 order by table_name, ordinal_position) from information_schema.columns where table_schema=?)))
            """, String.class, schema, schema, schema, schema);
    }

    private synchronized void drop() {
        if (schema == null) return;
        try { admin.execute("drop schema if exists " + schema + "_seed cascade; drop schema if exists " + schema + " cascade"); }
        catch (RuntimeException ignored) { /* 폐기용 DB라 종료 시 정리 실패는 무시한다. */ }
        schema = null;
    }
}
