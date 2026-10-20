package com.ssafy.dio.diary;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;

import jakarta.persistence.EntityManager;

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

import com.ssafy.dio.diary.domain.Diary;
import com.ssafy.dio.diary.repository.DiaryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "dio.postgres-test", matches = "true")
@Transactional
class PostgresDiaryUpdateTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;
	@Autowired JdbcTemplate jdbc;
	@Autowired EntityManager entityManager;

	private Long fixture() {
		assertThat(jdbc.queryForObject("select version()", String.class)).contains("PostgreSQL");
		Long id = diaries.saveAndFlush(new Diary("POSTGRES_UPDATE_TEST", "#D6BFA7", "LINEN", "RING", "1",
			new BigDecimal("1280"), new BigDecimal("800"), "BLANK")).getDiaryId();
		jdbc.update("update diaries set created_at = timestamp with time zone '2020-01-01 00:00:00+00', "
			+ "updated_at = timestamp with time zone '2020-01-01 00:00:00+00' where diary_id = ?", id);
		entityManager.clear();
		return id;
	}

	@Test
	void creationAndPatchResponseTimesMatchStoredMicrosecondPrecision() throws Exception {
		var creation = mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(DiaryCreationPersistenceTests.REQUEST))
			.andExpect(status().isCreated()).andReturn().getResponse();
		String creationBody = creation.getContentAsString();
		String id = com.jayway.jsonpath.JsonPath.read(creationBody, "$.diary.diaryId");
		String creationTime = com.jayway.jsonpath.JsonPath.read(creationBody, "$.diary.createdAt");
		var storedCreation = jdbc.queryForObject("select created_at from diaries where diary_id = ?", OffsetDateTime.class, Long.valueOf(id));
		assertThat(Instant.parse(creationTime)).isEqualTo(storedCreation.toInstant());
		var update = mvc.perform(patch("/api/v1/diaries/" + id).contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverColor\":\"#A8C8E8\"}"))
			.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		String preservedCreation = com.jayway.jsonpath.JsonPath.read(update, "$.diary.createdAt");
		String updatedTime = com.jayway.jsonpath.JsonPath.read(update, "$.diary.updatedAt");
		assertThat(preservedCreation).isEqualTo(creationTime);
		var storedUpdate = jdbc.queryForObject("select updated_at from diaries where diary_id = ?", OffsetDateTime.class, Long.valueOf(id));
		assertThat(Instant.parse(updatedTime)).isEqualTo(storedUpdate.toInstant());
	}

	@Test
	void patchPersistsFieldsAndDetailReadsChanges() throws Exception {
		Long id = fixture();
		var before = jdbc.queryForMap("select * from diaries where diary_id = ?", id);
		mvc.perform(patch("/api/v1/diaries/" + id).contentType(MediaType.APPLICATION_JSON).content("""
			{"diaryTitle":"  제주 여행  ","coverColor":"#A8C8E8","coverPattern":"LEATHER","bindingType":"BOUND"}
			"""))
			.andExpect(status().isOk()).andExpect(jsonPath("$.diary.diaryTitle").value("제주 여행"));
		entityManager.clear();
		var after = jdbc.queryForMap("select * from diaries where diary_id = ?", id);
		assertThat(after.get("title")).isEqualTo("제주 여행");
		assertThat(after.get("cover_color")).isEqualTo("#A8C8E8");
		assertThat(after.get("cover_style")).isEqualTo("LEATHER");
		assertThat(after.get("cover_binding")).isEqualTo("BOUND");
		for (String column : new String[]{"format_id", "canvas_width", "canvas_height", "default_page_template", "created_at", "owner_user_id"}) {
			assertThat(after.get(column)).isEqualTo(before.get(column));
		}
		assertThat(after.get("updated_at")).isNotEqualTo(before.get("updated_at"));
		mvc.perform(get("/api/v1/diaries/" + id)).andExpect(status().isOk())
			.andExpect(jsonPath("$.diary.coverPattern").value("LEATHER"));
	}

	@Test
	void partialUpdateKeepsOtherFieldsAndInvalidRequestDoesNotWrite() throws Exception {
		Long id = fixture();
		mvc.perform(patch("/api/v1/diaries/" + id).contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverColor\":\"#A8C8E8\"}")).andExpect(status().isOk());
		entityManager.clear();
		var partial = jdbc.queryForMap("select * from diaries where diary_id = ?", id);
		assertThat(partial.get("title")).isEqualTo("POSTGRES_UPDATE_TEST");
		assertThat(partial.get("cover_style")).isEqualTo("LINEN");
		assertThat(partial.get("cover_color")).isEqualTo("#A8C8E8");
		mvc.perform(patch("/api/v1/diaries/" + id).contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":null,\"coverColor\":\"#FFFFFF\"}"))
			.andExpect(status().isBadRequest());
		assertThat(jdbc.queryForMap("select * from diaries where diary_id = ?", id)).isEqualTo(partial);
	}
}
