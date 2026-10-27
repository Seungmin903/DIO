package com.f106.DIO.diary.trash;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.*;

import static org.assertj.core.api.Assertions.*;

class MemberDiaryTrashTests {
    JdbcTemplate jdbc, admin;
    String schema;
    TransactionTemplate tx;
    DiaryTrashService service;
    final Instant now = Instant.parse("2026-10-27T01:00:00Z");
    final UUID a = UUID.fromString("00000000-0000-0000-0000-000000000001");
    final UUID b = UUID.fromString("00000000-0000-0000-0000-000000000002");
    final UUID other = UUID.fromString("00000000-0000-0000-0000-000000000003");
    DiaryRequestIdentity owner(long id) {
        var identity=org.mockito.Mockito.mock(DiaryRequestIdentity.class);
        org.mockito.Mockito.when(identity.requireUserId(org.mockito.ArgumentMatchers.any())).thenReturn(id);
        return identity;
    }
    DiaryTrashService service(long user, Clock clock) {
        var repo=new DiaryDetailRepository(jdbc);
        return new DiaryTrashService(jdbc,owner(user),repo,new JdbcDiaryMembershipAccess(jdbc,repo),30,clock);
    }
    @BeforeEach void setup() {
        DriverManagerDataSource source;
        if ("true".equals(System.getenv("DIO_LIST_QUERY_PG"))) {
            String url = System.getenv("DB_URL");
            if (url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_trash_qa")) throw new IllegalStateException("Dedicated loopback dio_trash_qa required");
            admin = new JdbcTemplate(new DriverManagerDataSource(url, System.getenv("POSTGRES_USER"), System.getenv("POSTGRES_PASSWORD")));
            schema = "trash_qa_" + UUID.randomUUID().toString().replace("-", "");
            admin.execute("CREATE SCHEMA " + schema);
            source = new DriverManagerDataSource(url + (url.contains("?") ? "&" : "?") + "currentSchema=" + schema, System.getenv("POSTGRES_USER"), System.getenv("POSTGRES_PASSWORD"));
        } else source = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000", "sa", "");
        jdbc = new JdbcTemplate(source);
        tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        jdbc.execute("CREATE TABLE diaries(diary_id UUID PRIMARY KEY, owner_user_id BIGINT, title VARCHAR(100), cover_color VARCHAR(7), cover_style VARCHAR(30), visibility VARCHAR(20), created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE, deleted_at TIMESTAMP WITH TIME ZONE)");
        jdbc.execute("CREATE TABLE pages(page_id UUID PRIMARY KEY,diary_id UUID,deleted_at TIMESTAMP WITH TIME ZONE)");
        jdbc.execute("CREATE TABLE diary_members(diary_id UUID,user_id BIGINT,role VARCHAR(20),left_at TIMESTAMP WITH TIME ZONE,PRIMARY KEY(diary_id,user_id))");
        jdbc.execute("CREATE TABLE diary_invites(invite_id BIGINT,diary_id UUID,revoked_at TIMESTAMP WITH TIME ZONE)");
        jdbc.execute("CREATE TABLE users(user_id BIGINT PRIMARY KEY,status VARCHAR(20),deleted_at TIMESTAMP WITH TIME ZONE)");
        jdbc.update("INSERT INTO users VALUES(1,'ACTIVE',NULL),(2,'ACTIVE',NULL)");
        service=service(1,Clock.fixed(now,ZoneOffset.UTC));
        add(a, 1, now.minus(Duration.ofDays(29))); add(b, 1, now.minus(Duration.ofDays(30))); add(other, 2, now.minus(Duration.ofDays(1)));
    }
    @AfterEach void cleanup() { if (schema != null) admin.execute("DROP SCHEMA " + schema + " CASCADE"); }
    void add(UUID id, long owner, Instant deleted) {
        jdbc.update("INSERT INTO diaries VALUES (?,?,?,'#CED9EE','PLAIN','PRIVATE',?,?,?)", id, owner, "여행_" + owner + "%", Timestamp.from(now.minus(Duration.ofDays(40))), Timestamp.from(deleted), Timestamp.from(deleted));
        jdbc.update("INSERT INTO diary_members VALUES(?,?,'OWNER',NULL)",id,owner);
    }
    com.f106.DIO.diary.dto.DiaryResponse restore(UUID id) { return tx.execute(status -> service.restore(id)); }
    @Test void trashListIsScopedAndPagedAndShowsExactExpiry() {
        var first = service.list("여행_1%", 1, null);
        assertThat(first.items()).hasSize(1);
        assertThat(first.items().get(0).diaryId()).isEqualTo(a.toString());
        assertThat(first.items().get(0).canRestore()).isTrue();
        assertThat(first.items().get(0).purgeAt()).isEqualTo(now.plus(Duration.ofDays(1)));
        var second = service.list("여행_1%", 1, first.nextCursor());
        assertThat(second.items().get(0).diaryId()).isEqualTo(b.toString());
        assertThat(second.items().get(0).canRestore()).isFalse();
        assertThat(second.items().get(0).purgeAt()).isEqualTo(now);
        assertThat(second.hasNext()).isFalse();
        assertThat(second.nextCursor()).isNull();
        var someoneElse = service(2,Clock.fixed(now,ZoneOffset.UTC));
        assertThatThrownBy(() -> someoneElse.list("여행_1%", 1, first.nextCursor())).isInstanceOf(DiaryDetailException.class);
    }
    @Test void restoreIsIdempotentAndPreservesMetadataAndChildStates() {
        UUID page = UUID.randomUUID(); Instant previous = now.minusSeconds(100);
        jdbc.update("INSERT INTO pages VALUES (?,?,?)", page, a, Timestamp.from(previous));
        jdbc.update("INSERT INTO diary_invites VALUES (?,?,?)", 1, a, Timestamp.from(previous));
        var restored = restore(a);
        assertThat(restored.diary().diaryId()).isEqualTo(a.toString());
        assertThat(restored.diary().coverStyle()).isEqualTo("PLAIN");
        assertThat(restored.diary().updatedAt()).isEqualTo(now);
        assertThat(jdbc.queryForObject("SELECT deleted_at FROM diaries WHERE diary_id=?", Timestamp.class, a)).isNull();
        assertThat(restore(a)).isEqualTo(restored);
        var later = service(1,Clock.fixed(now.plusSeconds(60),ZoneOffset.UTC));
        var repeated = tx.execute(status -> later.restore(a));
        assertThat(repeated).isEqualTo(restored);
        assertThat(jdbc.queryForObject("SELECT deleted_at FROM pages WHERE page_id=?", Timestamp.class, page).toInstant()).isEqualTo(previous);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM diary_members WHERE diary_id=? AND left_at IS NULL", Integer.class, a)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT revoked_at FROM diary_invites WHERE diary_id=?", Timestamp.class, a).toInstant()).isEqualTo(previous);
        assertThat(service.list(null, 20, null).items()).extracting(x -> x.diaryId()).containsExactly(b.toString());
    }
    @Test void beforeExpiryRestoresButExactAndAfterExpiryDoNotChangeDeletion() {
        assertThatThrownBy(() -> restore(b)).isInstanceOf(DiaryDetailException.class);
        assertThat(jdbc.queryForObject("SELECT deleted_at FROM diaries WHERE diary_id=?", Timestamp.class, b).toInstant()).isEqualTo(now.minus(Duration.ofDays(30)));
        var before = service(1,Clock.fixed(now.minusNanos(1000),ZoneOffset.UTC));
        var restored = tx.execute(status -> before.restore(b));
        assertThat(restored).isNotNull();
        jdbc.update("UPDATE diaries SET deleted_at=? WHERE diary_id=?", Timestamp.from(now.minus(Duration.ofDays(31))), b);
        assertThatThrownBy(() -> restore(b)).isInstanceOf(DiaryDetailException.class);
    }
    @Test void nonexistentAndOtherOwnerLookTheSameAndAccessFailureDoesNotWrite() {
        assertThatThrownBy(() -> restore(other)).isInstanceOf(DiaryDetailException.class);
        assertThatThrownBy(() -> restore(UUID.randomUUID())).isInstanceOf(DiaryDetailException.class);
        jdbc.update("UPDATE users SET status='SUSPENDED' WHERE user_id=1");
        assertThatThrownBy(() -> restore(a)).isInstanceOfSatisfying(DiaryDetailException.class,e -> assertThat(e.status().value()).isEqualTo(401));
        assertThat(jdbc.queryForObject("SELECT deleted_at FROM diaries WHERE diary_id=?", Timestamp.class, a)).isNotNull();
    }
    @Test void activeRowsAreNotListedAndInvalidInputsFail() {
        restore(a);
        assertThat(service.list("no-match", 20, null).items()).isEmpty();
        assertThat(service.list(null, 20, null).items()).extracting(x -> x.diaryId()).containsExactly(b.toString());
        for (int limit : List.of(0, 101)) assertThatThrownBy(() -> service.list(null, limit, null)).isInstanceOf(DiaryDetailException.class);
        assertThatThrownBy(() -> service.list("x".repeat(101), 20, null)).isInstanceOf(DiaryDetailException.class);
        assertThatThrownBy(() -> service.list(null, 20, "bad")).isInstanceOf(DiaryDetailException.class);
    }
    @Test void concurrentRestoresReturnSameStateAndDoNotExtendRetention() throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> restore(a)); var second = pool.submit(() -> restore(a));
            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(second.get(10, TimeUnit.SECONDS));
            assertThat(jdbc.queryForObject("SELECT updated_at FROM diaries WHERE diary_id=?", Timestamp.class, a).toInstant()).isEqualTo(now);
        } finally { pool.shutdownNow(); assertThat(pool.awaitTermination(10,TimeUnit.SECONDS)).isTrue(); }
    }
    @Test void repeatedDeleteDoesNotExtendRetentionAndRevokedOwnerCannotRestore() {
        restore(a); tx.executeWithoutResult(s -> service.trash(a));
        Instant deleted=jdbc.queryForObject("SELECT deleted_at FROM diaries WHERE diary_id=?",Timestamp.class,a).toInstant();
        var later=service(1,Clock.fixed(now.plusSeconds(60),ZoneOffset.UTC));
        tx.executeWithoutResult(s -> later.trash(a));
        assertThat(jdbc.queryForObject("SELECT deleted_at FROM diaries WHERE diary_id=?",Timestamp.class,a).toInstant()).isEqualTo(deleted);
        jdbc.update("UPDATE diary_members SET left_at=? WHERE diary_id=?",Timestamp.from(now),a);
        assertThatThrownBy(() -> restore(a)).isInstanceOfSatisfying(DiaryDetailException.class,e -> assertThat(e.status().value()).isEqualTo(404));
        assertThat(service.list(null,20,null).items()).extracting(x->x.diaryId()).doesNotContain(a.toString());
    }
    @Test void inconsistentOwnerRolesCannotReadRestoreOrDelete() {
        for(String role:List.of("EDITOR","VIEWER","UNKNOWN")) {
            jdbc.update("UPDATE diary_members SET role=? WHERE diary_id=? AND user_id=1",role,a);
            assertThatThrownBy(() -> restore(a)).isInstanceOfSatisfying(DiaryDetailException.class,e -> assertThat(e.status().value()).isEqualTo(404));
            assertThatThrownBy(() -> tx.executeWithoutResult(s -> service.trash(a))).isInstanceOf(DiaryDetailException.class);
            assertThat(service.list(null,20,null).items()).extracting(x->x.diaryId()).doesNotContain(a.toString());
        }
    }
}
