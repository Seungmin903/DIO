package com.f106.DIO.notification;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import com.f106.DIO.notification.repository.NotificationWatermarkRepository;
import com.f106.DIO.notification.service.NotificationMutationService;
import com.f106.DIO.notification.support.NotificationException;
import static org.assertj.core.api.Assertions.*;

class NotificationReadAllSnapshotTests {
    @Test
    void limitIncludesAppliedTokensUntilExpiryAndAllowsNewTokenAfterExpiry() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:read_all_limit;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(ds);
        jdbc.execute("create table users(user_id bigint primary key)");
        jdbc.execute("create table notifications(notification_id bigint primary key, user_id bigint, read_at timestamp with time zone, deleted_at timestamp with time zone)");
        jdbc.execute("create table notification_read_watermarks(watermark_id uuid primary key, user_id bigint, created_at timestamp with time zone, expires_at timestamp with time zone, applied_at timestamp with time zone)");
        jdbc.execute("create table notification_read_watermark_items(watermark_id uuid, notification_id bigint, primary key(watermark_id, notification_id))");
        jdbc.update("insert into users values (1)");
        var now = Instant.parse("2026-10-28T00:00:00Z");
        var repository = new NotificationWatermarkRepository(jdbc);
        var clocks = new StaticListableBeanFactory(Map.of("clock", Clock.fixed(now, ZoneOffset.UTC))).getBeanProvider(Clock.class);
        var service = new NotificationMutationService(repository, clocks);
        var tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        var first = tx.execute(s -> service.prepareReadAll(1));
        tx.executeWithoutResult(s -> service.readAll(1, first.readWatermark()));
        for (int i = 1; i < 20; i++) tx.execute(s -> service.prepareReadAll(1));
        assertThatThrownBy(() -> tx.execute(s -> service.prepareReadAll(1)))
            .isInstanceOfSatisfying(NotificationException.class, e -> {
                assertThat(e.status().value()).isEqualTo(429);
                assertThat(e.code()).isEqualTo("READ_WATERMARK_LIMIT");
            });
        var laterClocks = new StaticListableBeanFactory(Map.of("clock", Clock.fixed(now.plusSeconds(600), ZoneOffset.UTC))).getBeanProvider(Clock.class);
        var later = new NotificationMutationService(repository, laterClocks);
        var renewed = tx.execute(s -> later.prepareReadAll(1));
        assertThat(renewed).isNotNull();
        assertThat(repository.activeCount(1, now.plusSeconds(600))).isEqualTo(1);
    }
    @Test
    void snapshotExcludesNewNotificationsAndRetryDoesNotReadThem() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:read_all_snapshot;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(ds);
        jdbc.execute("create table users(user_id bigint primary key)");
        jdbc.execute("create table notifications(notification_id bigint primary key, user_id bigint, read_at timestamp with time zone, deleted_at timestamp with time zone)");
        jdbc.execute("create table notification_read_watermarks(watermark_id uuid primary key, user_id bigint, created_at timestamp with time zone, expires_at timestamp with time zone, applied_at timestamp with time zone)");
        jdbc.execute("create table notification_read_watermark_items(watermark_id uuid, notification_id bigint, primary key(watermark_id, notification_id))");
        jdbc.update("insert into users values (1),(2)");
        jdbc.update("insert into notifications(notification_id,user_id) values (1,1),(2,2)");
        var clocks = new StaticListableBeanFactory(Map.of("clock", Clock.fixed(Instant.parse("2026-10-28T00:00:00Z"), ZoneOffset.UTC))).getBeanProvider(Clock.class);
        var service = new NotificationMutationService(new NotificationWatermarkRepository(jdbc), clocks);
        var tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        var token = tx.execute(s -> service.prepareReadAll(1));
        jdbc.update("insert into notifications(notification_id,user_id) values (3,1)");
        assertThatThrownBy(() -> tx.executeWithoutResult(s -> service.readAll(2, token.readWatermark()))).isInstanceOf(NotificationException.class);
        tx.executeWithoutResult(s -> service.readAll(1, token.readWatermark()));
        assertThat(jdbc.queryForObject("select count(*) from notification_read_watermark_items where watermark_id=?", Long.class, token.readWatermark())).isZero();
        tx.executeWithoutResult(s -> service.readAll(1, token.readWatermark()));
        assertThat(jdbc.queryForObject("select read_at from notifications where notification_id=1", java.sql.Timestamp.class)).isNotNull();
        assertThat(jdbc.queryForObject("select read_at from notifications where notification_id=2", java.sql.Timestamp.class)).isNull();
        assertThat(jdbc.queryForObject("select read_at from notifications where notification_id=3", java.sql.Timestamp.class)).isNull();
    }
}
