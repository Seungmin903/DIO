package com.f106.DIO.notification;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import com.f106.DIO.notification.repository.NotificationWatermarkRepository;
import com.f106.DIO.notification.service.NotificationMutationService;
import com.f106.DIO.notification.support.NotificationException;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DIO_READALL_TEST_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_readall_qa")
class ReadAllPostgresTests {
    @Test
    void migrationSnapshotAndRetryOnPostgres() throws Exception {
        var ds = new DriverManagerDataSource(System.getenv("DIO_READALL_TEST_URL"), "postgres", System.getenv("DIO_READALL_TEST_PASSWORD"));
        Flyway.configure().dataSource(ds).target("14").load().migrate();
        var jdbc = new JdbcTemplate(ds);
        jdbc.update("insert into users(user_id,nickname,nickname_key) values (1,'test','test'),(2,'other','other')");
        jdbc.update("insert into notifications(notification_id,user_id,notification_type,created_at) values (200,1,'DIARY_INVITE',?)", Timestamp.from(Instant.now()));
        Flyway.configure().dataSource(ds).load().migrate();
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='15' and success", Long.class)).isEqualTo(1);
        var service = new NotificationMutationService(new NotificationWatermarkRepository(jdbc), new StaticListableBeanFactory(Map.of("clock", Clock.systemUTC())).getBeanProvider(Clock.class));
        var tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        try (var pending = ds.getConnection()) {
            pending.setAutoCommit(false);
            try (var insert = pending.prepareStatement("insert into notifications(notification_id,user_id,notification_type,created_at) values (100,1,'DIARY_INVITE',?)")) {
                insert.setTimestamp(1, Timestamp.from(Instant.now())); insert.executeUpdate();
            }
            var token = tx.execute(s -> service.prepareReadAll(1));
            pending.commit();
            assertThatThrownBy(() -> tx.executeWithoutResult(s -> service.readAll(2, token.readWatermark()))).isInstanceOf(NotificationException.class);
            assertThatThrownBy(() -> tx.executeWithoutResult(s -> { service.readAll(1, token.readWatermark()); throw new IllegalStateException("rollback"); })).isInstanceOf(IllegalStateException.class);
            assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items where watermark_id=?", Long.class, token.readWatermark())).isEqualTo(1);
            assertThat(jdbc.queryForObject("select read_at from notifications where notification_id=200", Timestamp.class)).isNull();
            tx.executeWithoutResult(s -> service.readAll(1, token.readWatermark()));
            assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items where watermark_id=?", Long.class, token.readWatermark())).isZero();
            var first = jdbc.queryForObject("select read_at from notifications where notification_id=200", Timestamp.class);
            tx.executeWithoutResult(s -> service.readAll(1, token.readWatermark()));
            assertThat(jdbc.queryForObject("select read_at from notifications where notification_id=200", Timestamp.class)).isEqualTo(first).isNotNull();
            assertThat(jdbc.queryForObject("select read_at from notifications where notification_id=100", Timestamp.class)).isNull();
        }
        var concurrentToken = tx.execute(s -> service.prepareReadAll(1));
        var executor = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            var first = executor.submit(() -> { start.await(); tx.executeWithoutResult(s -> service.readAll(1, concurrentToken.readWatermark())); return true; });
            var second = executor.submit(() -> { start.await(); tx.executeWithoutResult(s -> service.readAll(1, concurrentToken.readWatermark())); return true; });
            start.countDown();
            assertThat(first.get(15, TimeUnit.SECONDS)).isTrue();
            assertThat(second.get(15, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(15, TimeUnit.SECONDS)).isTrue();
        }
        var applied = jdbc.queryForObject("select applied_at from notification_read_watermarks where watermark_id=?", Timestamp.class, concurrentToken.readWatermark());
        assertThat(jdbc.queryForObject("select read_at from notifications where notification_id=100", Timestamp.class)).isEqualTo(applied).isNotNull();

        var fixed = Instant.parse("2030-01-01T00:00:00Z");
        var fixedService = new NotificationMutationService(new NotificationWatermarkRepository(jdbc), new StaticListableBeanFactory(Map.of("clock", Clock.fixed(fixed, ZoneOffset.UTC))).getBeanProvider(Clock.class));
        var expires = tx.execute(s -> fixedService.prepareReadAll(1));
        var before = new NotificationMutationService(new NotificationWatermarkRepository(jdbc), new StaticListableBeanFactory(Map.of("clock", Clock.fixed(expires.expiresAt().minusNanos(1000), ZoneOffset.UTC))).getBeanProvider(Clock.class));
        var at = new NotificationMutationService(new NotificationWatermarkRepository(jdbc), new StaticListableBeanFactory(Map.of("clock", Clock.fixed(expires.expiresAt(), ZoneOffset.UTC))).getBeanProvider(Clock.class));
        var atToken = tx.execute(s -> fixedService.prepareReadAll(1));
        tx.executeWithoutResult(s -> before.readAll(1, expires.readWatermark()));
        assertThatThrownBy(() -> tx.executeWithoutResult(s -> at.readAll(1, atToken.readWatermark())))
            .isInstanceOfSatisfying(NotificationException.class, e -> assertThat(e.code()).isEqualTo("READ_WATERMARK_EXPIRED"));
        assertThat(jdbc.queryForObject("select applied_at from notification_read_watermarks where watermark_id=?", Timestamp.class, atToken.readWatermark())).isNull();
        var repository = new NotificationWatermarkRepository(jdbc);
        while (tx.execute(s -> repository.removeExpiredBatch(expires.expiresAt(), 500)) > 0) { }
        assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items where watermark_id=?", Long.class, atToken.readWatermark())).isZero();
        assertThatThrownBy(() -> tx.executeWithoutResult(s -> at.readAll(1, atToken.readWatermark())))
            .isInstanceOfSatisfying(NotificationException.class, e -> assertThat(e.code()).isEqualTo("INVALID_READ_WATERMARK"));

        // 한 사용자에 미읽음 1만 개와 최대 20개 경계: 스냅샷 생성 및 cascade 삭제를 실제 DB에서 확인한다.
        jdbc.update("insert into users(user_id,nickname,nickname_key) values (3,'load','load')");
        jdbc.update("insert into notifications(notification_id,user_id,notification_type,created_at) select n,3,'DIARY_INVITE',now() from generate_series(1000,10999) n");
        long insertStarted = System.nanoTime();
        for (int i = 0; i < 20; i++) tx.execute(s -> fixedService.prepareReadAll(3));
        long insertMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - insertStarted);
        assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items i join notification_read_watermarks w using(watermark_id) where w.user_id=3", Long.class)).isEqualTo(200000);
        long deleteStarted = System.nanoTime();
        int cleanupCalls = 0;
        while (true) {
            int removed = tx.execute(s -> repository.removeExpiredBatch(fixed.plusSeconds(600), 500));
            assertThat(removed).isLessThanOrEqualTo(501);
            if (removed == 0) break;
            cleanupCalls++;
        }
        assertThat(cleanupCalls).isEqualTo(400);
        long deleteMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - deleteStarted);
        assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items", Long.class)).isZero();
        System.out.printf("Watermark load fixture: 20 snapshots x 10000 unread; insert=%dms, bounded cleanup=%dms, batches=%d%n", insertMillis, deleteMillis, cleanupCalls);

        var expiredToken = tx.execute(s -> fixedService.prepareReadAll(3));
        var afterExpiry = new NotificationMutationService(repository, new StaticListableBeanFactory(Map.of("clock", Clock.fixed(fixed.plusSeconds(600), ZoneOffset.UTC))).getBeanProvider(Clock.class));
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var workers = Executors.newFixedThreadPool(2);
        try {
            var cleanup = workers.submit(() -> tx.execute(s -> {
                int removed = repository.removeExpiredBatch(fixed.plusSeconds(600), 100);
                locked.countDown();
                try { if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("cleanup timed out"); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                s.setRollbackOnly();
                return removed;
            }));
            assertThat(locked.await(15, TimeUnit.SECONDS)).isTrue();
            int competingCleanup = tx.execute(s -> repository.removeExpiredBatch(fixed.plusSeconds(600), 100));
            assertThat(competingCleanup).isEqualTo(0);
            var issuance = workers.submit(() -> tx.execute(s -> afterExpiry.prepareReadAll(3)));
            var newToken = issuance.get(15, TimeUnit.SECONDS);
            assertThat(newToken).isNotNull();
            release.countDown();
            assertThat(cleanup.get(15, TimeUnit.SECONDS)).isEqualTo(100);
            assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items where watermark_id=?", Long.class, expiredToken.readWatermark())).isEqualTo(10000);
            assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items where watermark_id=?", Long.class, newToken.readWatermark())).isEqualTo(10000);
            assertThatThrownBy(() -> tx.executeWithoutResult(s -> afterExpiry.readAll(3, expiredToken.readWatermark())))
                .isInstanceOfSatisfying(NotificationException.class, e -> assertThat(e.code()).isEqualTo("READ_WATERMARK_EXPIRED"));
            int resumedCleanup = tx.execute(s -> repository.removeExpiredBatch(fixed.plusSeconds(600), 100));
            assertThat(resumedCleanup).isEqualTo(100);
            assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items where watermark_id=?", Long.class, expiredToken.readWatermark())).isEqualTo(9900);
            assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items where watermark_id=?", Long.class, newToken.readWatermark())).isEqualTo(10000);
        } finally {
            release.countDown();
            workers.shutdownNow();
            assertThat(workers.awaitTermination(15, TimeUnit.SECONDS)).isTrue();
        }
    }
}
