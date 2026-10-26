package com.f106.DIO.diary;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;

import static org.assertj.core.api.Assertions.assertThat;

/** local PostgreSQL에서 Flyway V1과 UUID 다이어리 매핑을 검증한다. */
@SpringBootTest
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "dio.postgres-test", matches = "true")
@Transactional
class PostgresDiarySchemaTests {

	@Autowired JdbcTemplate jdbc;
	@Autowired DiaryRepository diaries;

	@Test
	void flywayV1CreatesTheUuidDiarySchema() {
		assertThat(jdbc.queryForObject("select version()", String.class)).contains("PostgreSQL");
		Diary diary = diaries.saveAndFlush(new Diary("POSTGRES_SCHEMA_TEST", "#D6BFA7", "PLAIN", "PRIVATE"));
		UUID id = diary.getDiaryId();
		assertThat(jdbc.queryForObject("select diary_id from diaries where diary_id = ?", UUID.class, id)).isEqualTo(id);
		assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version = '1' and success", Long.class))
			.isEqualTo(1L);
	}
}
