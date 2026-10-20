package com.ssafy.dio.diary;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** local PostgreSQL에서 Flyway·JPA 저장을 확인하며 테스트 행은 롤백한다. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "dio.postgres-test", matches = "true")
@Transactional
class PostgresDiaryCreationTests {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;

	@Test
	void createsViaHttpAndReadsActualPostgresRow() throws Exception {
		assertThat(jdbc.queryForObject("select version()", String.class)).contains("PostgreSQL");
		long before = jdbc.queryForObject("select count(*) from diaries", Long.class);
		String location = mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(DiaryCreationPersistenceTests.REQUEST))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.diary.canvasWidth").value(1280))
			.andExpect(jsonPath("$.diary.canvasHeight").value(800))
			.andReturn().getResponse().getHeader("Location");
		long id = Long.parseLong(location.substring(location.lastIndexOf('/') + 1));
		var row = jdbc.queryForMap("select * from diaries where diary_id = ?", id);
		assertThat(row.get("title")).isEqualTo("여행 다이어리");
		assertThat(row.get("cover_style")).isEqualTo("LINEN");
		assertThat(row.get("owner_user_id")).isNull();
		assertThat(jdbc.queryForObject("select count(*) from diaries", Long.class)).isEqualTo(before + 1);
	}

	@Test
	void unknownFormatAndInvalidRequestLeaveNoRows() throws Exception {
		long before = jdbc.queryForObject("select count(*) from diaries", Long.class);
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(DiaryCreationPersistenceTests.REQUEST.replace("\"formatId\":\"1\"", "\"formatId\":\"unknown\"")))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_DIARY_FORMAT"));
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(DiaryCreationPersistenceTests.REQUEST.replace("#D6BFA7", "red")))
			.andExpect(status().isBadRequest());
		assertThat(jdbc.queryForObject("select count(*) from diaries", Long.class)).isEqualTo(before);
	}
}
