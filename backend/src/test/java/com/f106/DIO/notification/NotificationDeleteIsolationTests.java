package com.f106.DIO.notification;

import java.time.Clock;
import java.time.Instant;
import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.*;

import com.f106.DIO.notification.auth.NotificationUserPrincipal;
import com.f106.DIO.notification.controller.NotificationController;
import com.f106.DIO.notification.repository.NotificationRepository;
import com.f106.DIO.notification.service.NotificationDeleteService;
import com.f106.DIO.notification.service.NotificationService;
import com.f106.DIO.notification.support.NotificationExceptionHandler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** watermark Bean/테이블 및 JPA/인증 구성이 전혀 없는 실제 JDBC/트랜잭션 삭제 검증. */
@SpringJUnitConfig(NotificationDeleteIsolationTests.Config.class)
@Transactional
class NotificationDeleteIsolationTests {
    @org.springframework.boot.test.context.TestConfiguration
    @EnableTransactionManagement
    @Import({NotificationRepository.class, NotificationService.class, NotificationDeleteService.class})
    static class Config {
        @Bean(destroyMethod = "shutdown")
        EmbeddedDatabase dataSource() { return new EmbeddedDatabaseBuilder().setType(EmbeddedDatabaseType.H2)
            .setName("notification-delete-only;MODE=PostgreSQL").addScript("classpath:notification-core-h2.sql").build(); }
        @Bean JdbcTemplate jdbcTemplate(DataSource dataSource) { return new JdbcTemplate(dataSource); }
        @Bean DataSourceTransactionManager transactionManager(DataSource dataSource) { return new DataSourceTransactionManager(dataSource); }
        @Bean Clock clock() { return mock(Clock.class); }
    }

    @Autowired ApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    @Autowired NotificationService queries;
    @Autowired NotificationDeleteService deletions;
    @Autowired Clock clock;
    MockMvc mvc;
    static final Instant AT = Instant.parse("2026-10-27T00:00:00.123456789Z");

    @BeforeEach
    void setup() {
        reset(clock); when(clock.instant()).thenReturn(AT, AT.plusSeconds(30));
        jdbc.update("insert into users(user_id,nickname) values(1,'recipient'),(2,'other')");
        jdbc.update("insert into notifications(notification_id,user_id,notification_type,created_at) values(10,1,'DIARY_INVITE',CURRENT_TIMESTAMP),(20,2,'DIARY_INVITE',CURRENT_TIMESTAMP)");
        mvc = MockMvcBuilders.standaloneSetup(new NotificationController(queries, deletions))
            .setControllerAdvice(new NotificationExceptionHandler()).build();
    }

    static NotificationUserPrincipal user() {
        return new NotificationUserPrincipal() { public long userId() { return 1; } public String getName() { return "verified-test"; } };
    }

    @Test
    void deletesWithNoWatermarkBeansOrTablesAndKeepsOriginalTimeOnRetry() throws Exception {
        assertThat(java.util.Arrays.stream(context.getBeanDefinitionNames()).map(context::getType)
            .filter(java.util.Objects::nonNull).map(Class::getName).toList())
            .noneMatch(name -> name.contains("Watermark") || name.endsWith(".NotificationMutationService"));
        assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where lower(table_name) like '%watermark%'", Integer.class)).isZero();
        mvc.perform(delete("/api/v1/notifications/10").principal(user())).andExpect(status().isNoContent()).andExpect(content().string(""));
        var first = jdbc.queryForObject("select deleted_at from notifications where notification_id=10", java.sql.Timestamp.class);
        assertThat(first.toInstant()).isEqualTo(AT.truncatedTo(java.time.temporal.ChronoUnit.MICROS));
        mvc.perform(delete("/api/v1/notifications/10").principal(user())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select deleted_at from notifications where notification_id=10", java.sql.Timestamp.class)).isEqualTo(first);
    }

    @Test
    void deniesOtherAndMissingRowsWithoutChangingTheOtherRecipient() throws Exception {
        for (long id : new long[]{20, 99}) mvc.perform(delete("/api/v1/notifications/" + id).principal(user()))
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOTIFICATION_NOT_FOUND"));
        assertThat(jdbc.queryForObject("select deleted_at from notifications where notification_id=20", java.sql.Timestamp.class)).isNull();
    }

    @Test
    void refusesUnverifiedPrincipalAndSpoofedUserHeader() throws Exception {
        mvc.perform(delete("/api/v1/notifications/10").header("X-User-Id", "1")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/notifications/10").principal(() -> "1")).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select deleted_at from notifications where notification_id=10", java.sql.Timestamp.class)).isNull();
    }
}
