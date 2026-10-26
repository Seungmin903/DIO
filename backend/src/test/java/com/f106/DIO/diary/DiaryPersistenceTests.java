package com.f106.DIO.diary;

import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DiaryPersistenceTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;
	@Autowired EntityManager entityManager;

	@Test
	void createsAnApplicationGeneratedUuidAndPersistsSchemaDefaults() throws Exception {
		String body = mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"  여행 다이어리  \"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.diary.diaryId").isString())
			.andExpect(jsonPath("$.diary.coverColor").value("#CED9EE"))
			.andExpect(jsonPath("$.diary.coverStyle").value("PLAIN"))
			.andExpect(jsonPath("$.diary.visibility").value("PRIVATE"))
			.andReturn().getResponse().getContentAsString();

		UUID diaryId = UUID.fromString(com.jayway.jsonpath.JsonPath.read(body, "$.diary.diaryId"));
		entityManager.clear();
		Diary saved = diaries.findById(diaryId).orElseThrow();
		assertThat(saved.getTitle()).isEqualTo("여행 다이어리");
		assertThat(saved.getOwnerUserId()).isNull();
		assertThat(saved.getCreatedAt()).isEqualTo(saved.getUpdatedAt());
	}

	@Test
	void softDeleteHidesDiaryFromDetailAndList() throws Exception {
		Diary diary = diaries.saveAndFlush(new Diary("삭제 대상", "#D6BFA7", "PLAIN", "PRIVATE"));
		UUID diaryId = diary.getDiaryId();

		mvc.perform(delete("/api/v1/diaries/" + diaryId)).andExpect(status().isNoContent());
		entityManager.clear();
		assertThat(diaries.findById(diaryId).orElseThrow().getDeletedAt()).isNotNull();
		mvc.perform(get("/api/v1/diaries/" + diaryId)).andExpect(status().isNotFound());
		mvc.perform(get("/api/v1/diaries")).andExpect(status().isOk())
			.andExpect(jsonPath("$.items.length()").value(0));
	}

	@Test
	void rejectsInvalidVisibilityAndNonUuidPath() throws Exception {
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"기록\",\"visibility\":\"PUBLIC\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/diaries/not-a-uuid")).andExpect(status().isBadRequest());
	}
}
