package com.ssafy.dio.diary;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.dio.diary.domain.Diary;
import com.ssafy.dio.diary.repository.DiaryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "dio.postgres-test", matches = "true")
@Transactional
class PostgresDiaryListTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;
	@Autowired JdbcTemplate jdbc;

	@Test
	void returnsActualPostgresRowsWithoutChangingExistingData() throws Exception {
		assertThat(jdbc.queryForObject("select version()", String.class)).contains("PostgreSQL");
		long before = diaries.count();
		Diary diary = diaries.saveAndFlush(new Diary("POSTGRES_LIST_TEST", "#A8C8E8", "LEATHER", "RING", "1",
			new BigDecimal("1280"), new BigDecimal("800"), "BLANK"));
		String selector = "$.items[?(@.diaryId == '" + diary.getDiaryId() + "')]";
		mvc.perform(get("/api/v1/diaries"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items.length()").value((int) before + 1))
			.andExpect(jsonPath(selector + ".diaryTitle").value(hasItem("POSTGRES_LIST_TEST")))
			.andExpect(jsonPath(selector + ".coverPattern").value(hasItem("LEATHER")))
			.andExpect(jsonPath(selector + ".canvasWidth").value(hasItem(1280)));
		assertThat(diaries.count()).isEqualTo(before + 1);
	}
}
