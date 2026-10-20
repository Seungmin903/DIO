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
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "dio.postgres-test", matches = "true")
@Transactional
class PostgresDiaryDeleteTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;
	@Autowired JdbcTemplate jdbc;

	@Test
	void deletesActualRowAndPreservesOtherDiaries() throws Exception {
		assertThat(jdbc.queryForObject("select version()", String.class)).contains("PostgreSQL");
		long before = diaries.count();
		Long id = diaries.saveAndFlush(new Diary("POSTGRES_DELETE_TEST", "#D6BFA7", "LINEN", "RING", "1",
			new BigDecimal("1280"), new BigDecimal("800"), "BLANK")).getDiaryId();
		mvc.perform(delete("/api/v1/diaries/" + id))
			.andExpect(status().isNoContent()).andExpect(content().string(""));
		assertThat(jdbc.queryForObject("select count(*) from diaries where diary_id = ?", Long.class, id)).isZero();
		assertThat(diaries.count()).isEqualTo(before);
		mvc.perform(get("/api/v1/diaries/" + id)).andExpect(status().isNotFound());
		mvc.perform(get("/api/v1/diaries")).andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].diaryId").value(not(hasItem(id.toString()))));
		mvc.perform(delete("/api/v1/diaries/" + id))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
	}
}
