package com.f106.DIO.auth.login;

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
@SpringBootTest(properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@ActiveProfiles("test")
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
    @Test void freshMigrationChainAndHibernateMappingsAreCompatible() {
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where success", Long.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject("select data_type from information_schema.columns where table_schema='public' and table_name='diaries' and column_name='diary_id'", String.class)).isEqualTo("uuid");
        assertThat(jdbc.queryForObject("select count(*) from signup_email_verifications", Long.class)).isZero();
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
