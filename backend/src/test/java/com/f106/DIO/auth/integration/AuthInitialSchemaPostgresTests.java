package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.infrastructure.mail.SignupMailSender;
import com.f106.DIO.auth.repository.EmailVerificationRepository;
import com.f106.DIO.auth.service.EmailVerificationService;
import com.f106.DIO.auth.service.ExpiredLoginSessionCleanup;

import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

/** 사용자 DB가 아닌 별도 폐기용 PostgreSQL URL을 명시해야 실행된다. */
@SpringBootTest(properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
    "dio.signup.verification-secret=testing-only-secret-at-least-32-bytes-long"})
@ActiveProfiles("test")
@org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DIO_AUTH_SCHEMA_TEST", matches = "true")
class AuthInitialSchemaPostgresTests {
    static String url() { return System.getenv("DIO_AUTH_SCHEMA_TEST_URL"); }
    static String password() { return System.getenv("DIO_AUTH_SCHEMA_TEST_PASSWORD"); }
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        if (url() == null || !url().startsWith("jdbc:postgresql://127.0.0.1:"))
            throw new IllegalStateException("Explicit isolated PostgreSQL test URL required");
        registry.add("spring.datasource.url", AuthInitialSchemaPostgresTests::url);
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", AuthInitialSchemaPostgresTests::password);
        EmailLoginTests.temporaryJwtKey(registry);
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired ExpiredLoginSessionCleanup cleanup;
    @Autowired org.springframework.test.web.servlet.MockMvc mvc;
    @Autowired com.f106.DIO.auth.service.EmailVerificationService verification;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    com.f106.DIO.auth.repository.EmailVerificationRepository verifications;
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.f106.DIO.auth.infrastructure.mail.SignupMailSender mail;
    @Autowired com.f106.DIO.auth.service.LoginSessionService loginSessions;
    @Autowired com.f106.DIO.auth.service.EmailLoginService loginService;
    @Autowired com.f106.DIO.auth.repository.RefreshTokenRepository refreshTokens;
    @Autowired com.f106.DIO.user.repository.UserRepository refreshUsers;
    @Autowired org.springframework.transaction.PlatformTransactionManager refreshTransactions;
    @Test void concurrentRefreshRetriesConvergeAndRenewExpiryOnPostgres() throws Exception {
        var tx = new org.springframework.transaction.support.TransactionTemplate(refreshTransactions);
        String email = "refresh-" + UUID.randomUUID() + "@example.com";
        var first = tx.execute(status -> {
            var user = refreshUsers.saveAndFlush(new com.f106.DIO.user.domain.User(email,"갱신검증",java.time.Instant.now()));
            return loginSessions.create(user,"pg-qa",java.time.Instant.now());
        });
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var start = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.Callable<com.f106.DIO.auth.dto.LoginResponse> attempt = () -> {
                start.await(); return loginService.refresh(first.refreshToken());
            };
            var a=pool.submit(attempt); var b=pool.submit(attempt); start.countDown();
            var left=a.get(20,java.util.concurrent.TimeUnit.SECONDS);
            var right=b.get(20,java.util.concurrent.TimeUnit.SECONDS);
            assertThat(left.refreshToken()).isEqualTo(right.refreshToken()).isNotEqualTo(first.refreshToken());
            assertThat(loginService.refresh(first.refreshToken()).refreshToken()).isEqualTo(left.refreshToken());
            var token=refreshTokens.findById(refreshTokens.findIdByTokenHash(
                com.f106.DIO.auth.support.LoginSecrets.hash(left.refreshToken())).orElseThrow()).orElseThrow();
            assertThat(token.getRevokedAt()).isNull();
            assertThat(token.getTokenHash()).isEqualTo(com.f106.DIO.auth.support.LoginSecrets.hash(left.refreshToken()));
        } finally {
            pool.shutdownNow(); pool.awaitTermination(20,java.util.concurrent.TimeUnit.SECONDS);
            tx.executeWithoutResult(status -> refreshUsers.findByEmail(email).ifPresent(refreshUsers::delete));
        }
    }
    @Test void postgresSerializesFirstVerificationInsertWithoutOverwritingWinner() throws Exception {
        com.f106.DIO.auth.integration.VerificationRaceAssertions.verify(mvc, verifications, mail, verification, entityManager, "pg-race@example.com");
    }
    @jakarta.persistence.PersistenceContext jakarta.persistence.EntityManager entityManager;
    @Test void freshMigrationChainAndHibernateMappingsAreCompatible() {
        // 후속 마이그레이션과 다른 테스트가 남긴 인증 데이터가 있어도 스키마 검증은 독립적이다.
        assertThat(jdbc.queryForList("select version from flyway_schema_history where success order by installed_rank", String.class))
            .contains("1", "2", "3", "4", "5", "6", "7", "8");
        assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname='public' and tablename='refresh_tokens' and indexname='refresh_tokens_expiry_id_idx'", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select data_type from information_schema.columns where table_schema='public' and table_name='diaries' and column_name='diary_id'", String.class)).isEqualTo("uuid");
        assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname='public' and indexname in ('signup_verification_expiry_idx','password_reset_verification_expiry_idx')", Long.class)).isEqualTo(2);
    }
    @Test @org.springframework.transaction.annotation.Transactional
    void nicknameMigrationPreservesRowsAndAllowsDuplicateNamesButNotEmails() {
        assertThat(jdbc.queryForObject("select count(*) from pg_constraint where conrelid='users'::regclass and conname='users_nickname_key_unique'",Long.class)).isZero();
        jdbc.update("insert into users(email,nickname,nickname_key) values ('nickname-migration-a@example.com','같은이름','같은이름'),('nickname-migration-b@example.com','같은이름','같은이름')");
        assertThat(jdbc.queryForObject("select count(*) from users where email in ('nickname-migration-a@example.com','nickname-migration-b@example.com')",Long.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from pg_constraint where conrelid='users'::regclass and conname='users_email_unique'",Long.class)).isEqualTo(1);
    }
    @Test @org.springframework.transaction.annotation.Transactional
    void expiredSessionCleanupPreservesActiveSessionsAndRemovesTheirHistoryOnly() {
        jdbc.update("insert into users(user_id,email,nickname,nickname_key) values (987,'cleanup@example.com','cleanup','cleanup')");
        jdbc.update("insert into refresh_tokens(token_id,user_id,token_hash,expires_at) values (987,987,?,now()-interval '1 day')", "cd".repeat(32));
        jdbc.update("insert into refresh_tokens(token_id,user_id,token_hash,expires_at) values (988,987,?,now()+interval '1 day')", "ef".repeat(32));
        jdbc.update("insert into refresh_token_history(token_hash,token_id,rotated_at) values (?,987,now()),(?,988,now())", "ab".repeat(32), "aa".repeat(32));
        assertThat(cleanup.purgeExpired()).isEqualTo(1);
        // 테스트의 외부 트랜잭션이 열려 있으므로 JDBC 직접 조회 전에 JPA 삭제를 반영한다.
        entityManager.flush();
        assertThat(jdbc.queryForObject("select count(*) from refresh_tokens where token_id=987", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from refresh_token_history where token_id=987", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from refresh_tokens where token_id=988", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from refresh_token_history where token_id=988", Long.class)).isEqualTo(1);
        assertThat(cleanup.purgeExpired()).isZero();
    }
    @Test void upgradingExistingInitialSchemaPreservesUserDiaryAndSession() throws Exception {
        String schema = "auth_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var config = Flyway.configure().dataSource(url(), "postgres", password()).schemas(schema).defaultSchema(schema);
        config.target("1").load().migrate();
        UUID diary = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(url(), "postgres", password())) {
            connection.setSchema(schema);
            try (var statement = connection.createStatement()) {
                statement.execute("insert into users(user_id,email,nickname,profile_img) values (123,'legacy@example.com','Legacy','#123456')");
                statement.execute("insert into user_auth_accounts(user_id,provider,provider_subject,password_hash) values (123,'EMAIL','legacy@example.com','unchanged-hash')");
                statement.execute("insert into refresh_tokens(user_id,token_hash,expires_at) values (123,decode(repeat('ab',32),'hex'),now()+interval '1 day')");
                statement.execute("insert into diaries(diary_id,owner_user_id,title) values ('" + diary + "',123,'preserved')");
            }
        }
        Flyway.configure().dataSource(url(), "postgres", password()).schemas(schema).defaultSchema(schema).load().migrate();
        assertThat(jdbc.queryForObject("select nickname_key from " + schema + ".users where user_id=123", String.class)).isEqualTo("legacy");
        assertThat(jdbc.queryForObject("select title from " + schema + ".diaries where diary_id=?", String.class, diary)).isEqualTo("preserved");
        assertThat(jdbc.queryForObject("select token_hash from " + schema + ".refresh_tokens where user_id=123", String.class)).isEqualTo("ab".repeat(32));
        assertThat(jdbc.queryForObject("select session_id from " + schema + ".refresh_tokens where user_id=123", UUID.class)).isNotNull();
        assertThat(jdbc.queryForObject("select password_hash from " + schema + ".user_auth_accounts where user_id=123", String.class)).isEqualTo("unchanged-hash");
    }
}
