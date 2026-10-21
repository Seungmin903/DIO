package com.f106.DIO.diary;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"dio.diary.formats.1.width=1280", "dio.diary.formats.1.height=800"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DiaryListPersistenceTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;
	@Autowired JdbcTemplate jdbc;
	@Autowired EntityManager entityManager;

	@Test
	void returnsEmptyItemsFromEmptyDatabase() throws Exception {
		mvc.perform(get("/api/v1/diaries"))
			.andExpect(status().isOk())
			.andExpect(content().json("{\"items\":[]}"));
	}

	@Test
	void returnsStoredFieldsAndUsesIdAsTieBreakerForSameCreationTime() throws Exception {
		Diary first = diaries.saveAndFlush(new Diary("첫 기록", "#D6BFA7", "LINEN", "RING", "1",
			new BigDecimal("1280"), new BigDecimal("800"), "BLANK"));
		Diary second = diaries.saveAndFlush(new Diary("두 번째", "#A8C8E8", "LEATHER", "RING", "1",
			new BigDecimal("1280"), new BigDecimal("800"), "WEEKLY"));
		Instant same = Instant.parse("2026-10-19T01:00:00Z");
		jdbc.update("update diaries set created_at = ?, updated_at = ?", java.sql.Timestamp.from(same), java.sql.Timestamp.from(same));
		entityManager.clear();
		mvc.perform(get("/api/v1/diaries"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items.length()").value(2))
			.andExpect(jsonPath("$.items[0].diaryId").value(second.getDiaryId().toString()))
			.andExpect(jsonPath("$.items[1].diaryId").value(first.getDiaryId().toString()))
			.andExpect(jsonPath("$.items[0].diaryTitle").value("두 번째"))
			.andExpect(jsonPath("$.items[0].coverColor").value("#A8C8E8"))
			.andExpect(jsonPath("$.items[0].coverPattern").value("LEATHER"))
			.andExpect(jsonPath("$.items[0].bindingType").value("RING"))
			.andExpect(jsonPath("$.items[0].formatId").value("1"))
			.andExpect(jsonPath("$.items[0].canvasWidth").value(1280))
			.andExpect(jsonPath("$.items[0].canvasHeight").value(800))
			.andExpect(jsonPath("$.items[0].defaultPageTemplate").value("WEEKLY"))
			.andExpect(jsonPath("$.items[0].createdAt").value("2026-10-19T01:00:00Z"))
			.andExpect(jsonPath("$.items[0].updatedAt").value("2026-10-19T01:00:00Z"));
	}

	@Test
	void sortsByCreationTimeBeforeId() throws Exception {
		Diary first = diaries.saveAndFlush(new Diary("최근 생성", "#D6BFA7", "LINEN", "RING", "1",
			BigDecimal.ONE, BigDecimal.ONE, "BLANK"));
		Diary second = diaries.saveAndFlush(new Diary("과거 생성", "#D6BFA7", "LINEN", "RING", "1",
			BigDecimal.ONE, BigDecimal.ONE, "BLANK"));
		jdbc.update("update diaries set created_at = ? where diary_id = ?",
			java.sql.Timestamp.from(Instant.parse("2020-01-01T00:00:00Z")), second.getDiaryId());
		entityManager.clear();
		mvc.perform(get("/api/v1/diaries"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].diaryId").value(first.getDiaryId().toString()));
	}
}
