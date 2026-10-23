package com.f106.DIO.diary;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "dio.postgres-test", matches = "true")
@Transactional
class PostgresDiaryDetailTests {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;

	@Test
	void createThenReadPersistedDiaryByLocation() throws Exception {
		assertThat(jdbc.queryForObject("select version()", String.class)).contains("PostgreSQL");
		String location = mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(DiaryCreationPersistenceTests.REQUEST))
			.andExpect(status().isCreated()).andReturn().getResponse().getHeader("Location");
		String id = location.substring(location.lastIndexOf('/') + 1);
		mvc.perform(get(location))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.diary.diaryId").value(id))
			.andExpect(jsonPath("$.diary.diaryTitle").value("여행 다이어리"))
			.andExpect(jsonPath("$.diary.canvasWidth").value(1280))
			.andExpect(jsonPath("$.diary.canvasHeight").value(800));
		assertThat(jdbc.queryForObject("select title from diaries where diary_id = ?", String.class, Long.valueOf(id)))
			.isEqualTo("여행 다이어리");
	}

	@Test
	void absentIdReturns404WithoutAddingData() throws Exception {
		long count = jdbc.queryForObject("select count(*) from diaries", Long.class);
		long absent = jdbc.queryForObject("select coalesce(max(diary_id),0) + 1 from diaries", Long.class);
		mvc.perform(get("/api/v1/diaries/" + absent))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
		assertThat(jdbc.queryForObject("select count(*) from diaries", Long.class)).isEqualTo(count);
	}
}
