package com.f106.DIO.auth.integration;



import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** 전용 빈 테스트 DB에서만 실행한다. 상위 클래스가 테스트 행을 정리하므로 개인/공용 DB를 지정하지 않는다. */
@EnabledIfEnvironmentVariable(named = "DIO_RESET_POSTGRES_QA", matches = "true")
class PasswordResetPostgresTests extends PasswordResetTests {
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("DIO_RESET_POSTGRES_URL");
        boolean dedicated = url != null;
        if (url == null) url = System.getenv("DIO_AUTH_SCHEMA_TEST_URL");
        if (url == null || !(dedicated ? url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_reset_qa")
                : url.startsWith("jdbc:postgresql://127.0.0.1:")))
            throw new IllegalStateException("Use a dedicated loopback dio_reset_qa database only");
        String testUrl = url;
        registry.add("spring.datasource.url", () -> testUrl);
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> System.getenv(dedicated ? "DIO_RESET_POSTGRES_PASSWORD" : "DIO_AUTH_SCHEMA_TEST_PASSWORD"));
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.flyway.enabled", () -> "true");
    }
}
