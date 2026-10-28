package com.f106.DIO.diary;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
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
		String body = mvc.perform(post("/api/v1/diaries").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
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
		assertThat(saved.getOwnerUserId()).isEqualTo(1L);
		assertThat(saved.getCreatedAt()).isEqualTo(saved.getUpdatedAt());
	}

	@Test
	void softDeleteHidesDiaryFromDetailAndList() throws Exception {
		Diary diary = diaries.saveAndFlush(new Diary("삭제 대상", "#D6BFA7", "PLAIN", "PRIVATE", 1L));
		UUID diaryId = diary.getDiaryId();

		mvc.perform(delete("/api/v1/diaries/" + diaryId).with(authenticated())).andExpect(status().isNoContent());
		entityManager.clear();
		assertThat(diaries.findById(diaryId).orElseThrow().getDeletedAt()).isNotNull();
		mvc.perform(get("/api/v1/diaries/" + diaryId).with(authenticated())).andExpect(status().isNotFound());
		mvc.perform(get("/api/v1/diaries").with(authenticated())).andExpect(status().isOk())
			.andExpect(jsonPath("$.items.length()").value(0));
	}

	@Test
	void softDeletedDiaryCannotBeUpdatedOrDeletedAgain() throws Exception {
		Diary diary = diaries.saveAndFlush(new Diary("삭제 대상", "#D6BFA7", "PLAIN", "PRIVATE", 1L));
		UUID diaryId = diary.getDiaryId();

		mvc.perform(delete("/api/v1/diaries/" + diaryId).with(authenticated())).andExpect(status().isNoContent());
		mvc.perform(patch("/api/v1/diaries/" + diaryId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"수정 시도\"}"))
			.andExpect(status().isNotFound());
		mvc.perform(delete("/api/v1/diaries/" + diaryId).with(authenticated())).andExpect(status().isNotFound());
	}

	@Test
	void invalidPatchDoesNotChangePersistedDiary() throws Exception {
		Diary diary = diaries.saveAndFlush(new Diary("원래 제목", "#D6BFA7", "PLAIN", "PRIVATE", 1L));
		UUID diaryId = diary.getDiaryId();
		Instant originalUpdatedAt = diary.getUpdatedAt();

		mvc.perform(patch("/api/v1/diaries/" + diaryId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverStyle\":\"   \"}"))
			.andExpect(status().isBadRequest());

		entityManager.clear();
		Diary unchanged = diaries.findById(diaryId).orElseThrow();
		assertThat(unchanged.getTitle()).isEqualTo("원래 제목");
		assertThat(unchanged.getCoverStyle()).isEqualTo("PLAIN");
		assertThat(unchanged.getUpdatedAt()).isEqualTo(originalUpdatedAt);
	}

	@Test
	void exposesDiaryFieldsAndNotFoundProblemDetail() throws Exception {
		Diary diary = diaries.saveAndFlush(new Diary("상세 대상", "#D6BFA7", "LEATHER", "LINK", 1L));

		mvc.perform(get("/api/v1/diaries/" + diary.getDiaryId()).with(authenticated()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.diary.diaryId").value(diary.getDiaryId().toString()))
			.andExpect(jsonPath("$.diary.diaryTitle").value("상세 대상"))
			.andExpect(jsonPath("$.diary.coverColor").value("#D6BFA7"))
			.andExpect(jsonPath("$.diary.coverStyle").value("LEATHER"))
			.andExpect(jsonPath("$.diary.visibility").value("LINK"))
			.andExpect(jsonPath("$.diary.createdAt").exists())
			.andExpect(jsonPath("$.diary.updatedAt").exists());
		mvc.perform(get("/api/v1/diaries/00000000-0000-0000-0000-000000000099").with(authenticated()))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
	}

	@Test
	void updatesOnlyTheSuppliedFieldAndRefreshesUpdatedAt() throws Exception {
		Diary diary = diaries.saveAndFlush(new Diary("원래 제목", "#D6BFA7", "PLAIN", "PRIVATE", 1L));
		UUID diaryId = diary.getDiaryId();
		Instant oldUpdatedAt = Instant.parse("2020-01-01T00:00:00Z");
		entityManager.createNativeQuery("update diaries set updated_at = :updatedAt where diary_id = :diaryId")
			.setParameter("updatedAt", oldUpdatedAt)
			.setParameter("diaryId", diaryId)
			.executeUpdate();
		entityManager.clear();

		mvc.perform(patch("/api/v1/diaries/" + diaryId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverStyle\":\"LEATHER\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.diary.diaryTitle").value("원래 제목"))
			.andExpect(jsonPath("$.diary.coverColor").value("#D6BFA7"))
			.andExpect(jsonPath("$.diary.coverStyle").value("LEATHER"))
			.andExpect(jsonPath("$.diary.visibility").value("PRIVATE"));

		entityManager.clear();
		Diary updated = diaries.findById(diaryId).orElseThrow();
		assertThat(updated.getUpdatedAt()).isAfter(oldUpdatedAt);
	}

	@Test
	void listsByCreatedAtDescendingThenDiaryIdDescending() throws Exception {
		Diary oldest = diaries.saveAndFlush(new Diary("첫 번째", "#D6BFA7", "PLAIN", "PRIVATE", 1L));
		Diary sameTimeA = diaries.saveAndFlush(new Diary("두 번째", "#D6BFA7", "PLAIN", "PRIVATE", 1L));
		Diary sameTimeB = diaries.saveAndFlush(new Diary("세 번째", "#D6BFA7", "PLAIN", "PRIVATE", 1L));
		UUID lowerDiaryId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		UUID higherDiaryId = UUID.fromString("00000000-0000-0000-0000-000000000002");
		Instant first = Instant.parse("2026-01-01T00:00:00Z");
		Instant second = Instant.parse("2026-01-02T00:00:00Z");
		setCreatedAt(oldest.getDiaryId(), first);
		replaceDiaryId(sameTimeA.getDiaryId(), lowerDiaryId);
		replaceDiaryId(sameTimeB.getDiaryId(), higherDiaryId);
		setCreatedAt(lowerDiaryId, second);
		setCreatedAt(higherDiaryId, second);
		entityManager.clear();

		mvc.perform(get("/api/v1/diaries").with(authenticated()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].diaryId").value(higherDiaryId.toString()))
			.andExpect(jsonPath("$.items[1].diaryId").value(lowerDiaryId.toString()))
			.andExpect(jsonPath("$.items[2].diaryId").value(oldest.getDiaryId().toString()));
	}

	@Test
	void rejectsInvalidVisibilityAndNonUuidPath() throws Exception {
		mvc.perform(post("/api/v1/diaries").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"기록\",\"visibility\":\"PUBLIC\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/diaries/not-a-uuid").with(authenticated())).andExpect(status().isBadRequest());
	}

	private void setCreatedAt(UUID diaryId, Instant createdAt) {
		entityManager.createNativeQuery("update diaries set created_at = :createdAt where diary_id = :diaryId")
			.setParameter("createdAt", createdAt)
			.setParameter("diaryId", diaryId)
			.executeUpdate();
	}

	private void replaceDiaryId(UUID currentDiaryId, UUID replacementDiaryId) {
		entityManager.createNativeQuery("update diaries set diary_id = :replacementDiaryId where diary_id = :currentDiaryId")
			.setParameter("replacementDiaryId", replacementDiaryId)
			.setParameter("currentDiaryId", currentDiaryId)
			.executeUpdate();
	}

	private static RequestPostProcessor authenticated() {
		return jwt().jwt(token -> token.subject("1"));
	}
}
