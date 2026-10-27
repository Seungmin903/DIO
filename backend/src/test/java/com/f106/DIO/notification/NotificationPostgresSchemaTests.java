package com.f106.DIO.notification;

import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import com.f106.DIO.notification.repository.NotificationRepository;
import com.f106.DIO.notification.service.NotificationCursor;
import static org.assertj.core.api.Assertions.assertThat;

/** 기존 CI의 폐기용 PostgreSQL 안에서 생성한 독립 스키마에 V1과 최신 migration 체인을 각각 적용한다. */
@EnabledIfEnvironmentVariable(named = "DIO_AUTH_SCHEMA_TEST", matches = "true")
class NotificationPostgresSchemaTests {
    @Test void repositorySqlMatchesTheRealFlywaySchema() throws Exception { verifySchema(true); }
    @Test void repositorySqlMatchesTheLatestFlywaySchema() throws Exception { verifySchema(false); }
    private void verifySchema(boolean initialOnly) throws Exception {
        String url = System.getenv("DIO_AUTH_SCHEMA_TEST_URL");
        String password = System.getenv("DIO_AUTH_SCHEMA_TEST_PASSWORD");
        if (url == null || !url.startsWith("jdbc:postgresql://127.0.0.1:"))
            throw new IllegalStateException("Explicit isolated PostgreSQL test URL required");
        String schema = "notification_ci_" + UUID.randomUUID().toString().replace("-", "");
        try {
            var migrations = Flyway.configure().dataSource(url, "postgres", password).schemas(schema).defaultSchema(schema);
            if (initialOnly) migrations.target("1");
            migrations.load().migrate();
            try (var connection = DriverManager.getConnection(url, "postgres", password)) {
                connection.setSchema(schema);
                var jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
                var repository = new NotificationRepository(jdbc);
                Instant at = Instant.parse("2026-10-27T00:00:00.123456Z");
                UUID diary = UUID.randomUUID(), page = UUID.randomUUID();
                if (initialOnly) jdbc.update("insert into users(user_id,nickname) values (101,'recipient'),(102,'actor')");
                else jdbc.update("insert into users(user_id,nickname,nickname_key) values (101,'recipient','recipient'),(102,'actor','actor')");
                jdbc.update("insert into diaries(diary_id,owner_user_id,title) values (?,101,'notification QA')", diary);
                jdbc.update("insert into pages(page_id,diary_id,sort_key) values (?,?,1)", page, diary);
                for (long id : new long[]{9007199254740993L, 2L, 1L})
                    jdbc.update("insert into notifications(notification_id,user_id,actor_user_id,diary_id,page_id,notification_type,created_at) values (?,101,102,?,?,'DIARY_INVITE',?)",
                        id, diary, page, Timestamp.from(at));
                var rows = repository.list(101, null, 2);
                assertThat(rows).hasSize(2);
                assertThat(rows.get(0).notificationId()).isEqualTo("9007199254740993");
                assertThat(rows.get(0).actorUserId()).isEqualTo("102");
                assertThat(rows.get(0).diaryId()).isEqualTo(diary);
                assertThat(rows.get(0).pageId()).isEqualTo(page);
                assertThat(rows.get(0).createdAt()).isEqualTo(at);
                assertThat(repository.list(102, null, 20)).isEmpty();
                assertThat(repository.list(101, new NotificationCursor(at, 2), 20))
                    .extracting(row -> row.notificationId()).containsExactly("1");
                assertThat(repository.unreadCount(101)).isEqualTo(3);
                repository.markRead(101, 2, at.plusSeconds(1));
                repository.markRead(101, 2, at.plusSeconds(2));
                assertThat(repository.find(101, 2).orElseThrow().readAt()).isEqualTo(at.plusSeconds(1));
                assertThat(repository.unreadCount(101)).isEqualTo(2);
                repository.softDelete(102, 1, at); // 타인 요청은 변경하지 않는다.
                assertThat(repository.find(101, 1)).isPresent();
                repository.softDelete(101, 1, at.plusSeconds(3));
                repository.softDelete(101, 1, at.plusSeconds(4));
                assertThat(repository.find(101, 1)).isEmpty();
                assertThat(repository.existsIncludingDeleted(101, 1)).isTrue();
                assertThat(repository.existsIncludingDeleted(102, 1)).isFalse();
                assertThat(jdbc.queryForObject("select deleted_at from notifications where notification_id=1", Timestamp.class).toInstant())
                    .isEqualTo(at.plusSeconds(3));
                assertThat(repository.unreadCount(101)).isEqualTo(1);
                assertThat(repository.list(101, null, 20)).hasSize(2);
            }
        } finally {
            // schema는 위에서 고정 접두사 + UUID로만 생성한다. 다른 스키마/DB는 건드리지 않는다.
            try (var connection = DriverManager.getConnection(url, "postgres", password);
                 var statement = connection.createStatement()) { statement.execute("drop schema if exists " + schema + " cascade"); }
        }
    }
}
