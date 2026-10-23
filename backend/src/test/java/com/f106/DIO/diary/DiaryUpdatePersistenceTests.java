package com.f106.DIO.diary;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"dio.diary.formats.1.width=1280", "dio.diary.formats.1.height=800"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DiaryUpdatePersistenceTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;
	@Autowired EntityManager entityManager;
	@Autowired JdbcTemplate jdbc;

	private Long fixture() {
		Diary diary = diaries.saveAndFlush(new Diary("원래 제목", "#D6BFA7", "LINEN", "RING", "1",
			new BigDecimal("1280"), new BigDecimal("800"), "BLANK"));
		var old = java.sql.Timestamp.from(Instant.parse("2020-01-01T00:00:00Z"));
		jdbc.update("update diaries set created_at = ?, updated_at = ? where diary_id = ?", old, old, diary.getDiaryId());
		entityManager.clear();
		return diary.getDiaryId();
	}

	@Test
	void updatesAllFourFieldsAndKeepsCreationAndFormat() throws Exception {
		Long id = fixture();
		mvc.perform(patch("/api/v1/diaries/" + id).contentType(MediaType.APPLICATION_JSON).content("""
			{"diaryTitle":"  제주 여행  ","coverColor":"#A8C8E8","coverPattern":"LEATHER","bindingType":"BOUND"}
			"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.diary.diaryTitle").value("제주 여행"))
			.andExpect(jsonPath("$.diary.coverColor").value("#A8C8E8"));
		entityManager.clear();
		Diary saved = diaries.findById(id).orElseThrow();
		assertThat(saved.getTitle()).isEqualTo("제주 여행");
		assertThat(saved.getCoverColor()).isEqualTo("#A8C8E8");
		assertThat(saved.getCoverStyle()).isEqualTo("LEATHER");
		assertThat(saved.getCoverBinding()).isEqualTo("BOUND");
		assertThat(saved.getFormatId()).isEqualTo("1");
		assertThat(saved.getCanvasWidth()).isEqualByComparingTo("1280");
		assertThat(saved.getCanvasHeight()).isEqualByComparingTo("800");
		assertThat(saved.getDefaultPageTemplate()).isEqualTo("BLANK");
		assertThat(saved.getCreatedAt()).isEqualTo(Instant.parse("2020-01-01T00:00:00Z"));
		assertThat(saved.getUpdatedAt()).isAfter(saved.getCreatedAt());
	}

	@Test
	void colorOnlyKeepsOmittedFields() throws Exception {
		Long id = fixture();
		mvc.perform(patch("/api/v1/diaries/" + id).contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverColor\":\"#A8C8E8\"}")).andExpect(status().isOk());
		entityManager.clear();
		Diary saved = diaries.findById(id).orElseThrow();
		assertThat(saved.getTitle()).isEqualTo("원래 제목");
		assertThat(saved.getCoverStyle()).isEqualTo("LINEN");
		assertThat(saved.getCoverBinding()).isEqualTo("RING");
		assertThat(saved.getCoverColor()).isEqualTo("#A8C8E8");
	}

	@Test
	void sameValueStillUpdatesModificationTime() throws Exception {
		Long id = fixture();
		mvc.perform(patch("/api/v1/diaries/" + id).contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverColor\":\"#D6BFA7\"}")).andExpect(status().isOk());
		entityManager.clear();
		assertThat(diaries.findById(id).orElseThrow().getUpdatedAt()).isAfter(Instant.parse("2020-01-01T00:00:00Z"));
	}

	@ParameterizedTest
	@ValueSource(strings = {"{}", "{\"diaryTitle\":null}", "{\"coverColor\":\"bad\"}",
		"{\"coverColor\":\"#A8C8E8\",\"formatId\":\"2\"}", "{\"coverPattern\":\"OTHER\"}"})
	void invalidRequestLeavesStoredDataAndTimeUnchanged(String body) throws Exception {
		Long id = fixture();
		mvc.perform(patch("/api/v1/diaries/" + id).contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isBadRequest());
		entityManager.clear();
		Diary saved = diaries.findById(id).orElseThrow();
		assertThat(saved.getCoverColor()).isEqualTo("#D6BFA7");
		assertThat(saved.getTitle()).isEqualTo("원래 제목");
		assertThat(saved.getUpdatedAt()).isEqualTo(Instant.parse("2020-01-01T00:00:00Z"));
	}

	@Test
	void absentIdReturns404() throws Exception {
		mvc.perform(patch("/api/v1/diaries/9223372036854775807").contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverColor\":\"#A8C8E8\"}"))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
	}
}
