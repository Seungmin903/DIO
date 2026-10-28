package com.f106.DIO.diary;

import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Same real HTTP/transaction tests on a dedicated, explicitly opted-in disposable PostgreSQL DB. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=${DB_URL}","spring.jpa.hibernate.ddl-auto=validate","spring.flyway.enabled=true",
    "dio.auth.session-cleanup.enabled=false","dio.diary.creation-cleanup.enabled=false"
})
@ActiveProfiles("local")
@EnabledIfSystemProperty(named="dio.postgres-test",matches="true")
@EnabledIfEnvironmentVariable(named="DIO_DIARY_CREATE_PG_QA",matches="true")
class PostgresDiaryPurgeTests extends DiaryPurgeHttpTests {}
