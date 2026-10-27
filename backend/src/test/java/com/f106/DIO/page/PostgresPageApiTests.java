package com.f106.DIO.page;

import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/** local PostgreSQL(Flyway V1)의 pages·canvas_elements(jsonb 포함)에서 같은 흐름을 검증한다. 테스트 행은 롤백된다. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "dio.postgres-test", matches = "true")
@Transactional
class PostgresPageApiTests extends PageApiScenarios {
}
