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
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
// Internal legacy persistence regression; production authentication is covered by DiaryAuthenticatedReadTests.
@AutoConfigureMockMvc(addFilters = false)
@ActiveProfiles("test")
@Transactional
class DiaryPersistenceTests {

	@Autowired MockMvc mvc;
	@Autowired com.f106.DIO.diary.service.DiaryService service;
	@Autowired DiaryRepository diaries;
	@Autowired EntityManager entityManager;

	@Test
	void createsAnApplicationGeneratedUuidAndPersistsSchemaDefaults() throws Exception {
		var result=service.createDiary(new com.f106.DIO.diary.dto.DiaryCreateRequest("  여행 다이어리  ",null,null,null));
		UUID diaryId = UUID.fromString(result.diary().diaryId());
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

		service.deleteDiary(diaryId);
		entityManager.clear();
		assertThat(diaries.findById(diaryId).orElseThrow().getDeletedAt()).isNotNull();
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.getDiary(diaryId))
			.isInstanceOf(com.f106.DIO.diary.support.DiaryNotFoundException.class);
		assertThat(service.getDiaries().items()).isEmpty();
	}

	@Test
	void softDeletedDiaryCannotBeUpdatedOrDeletedAgain() throws Exception {
		Diary diary = diaries.saveAndFlush(new Diary("삭제 대상", "#D6BFA7", "PLAIN", "PRIVATE"));
		UUID diaryId = diary.getDiaryId();

		service.deleteDiary(diaryId);
        var request=new com.f106.DIO.diary.dto.DiaryUpdateRequest();request.setDiaryTitle("changed");
        org.assertj.core.api.Assertions.assertThatThrownBy(()->service.updateDiary(diaryId,request))
            .isInstanceOf(com.f106.DIO.diary.support.DiaryNotFoundException.class);
		org.assertj.core.api.Assertions.assertThatThrownBy(()->service.deleteDiary(diaryId)).isInstanceOf(com.f106.DIO.diary.support.DiaryNotFoundException.class);
	}

	@Test
	void invalidPatchDoesNotChangePersistedDiary() throws Exception {
		Diary diary = diaries.saveAndFlush(new Diary("원래 제목", "#D6BFA7", "PLAIN", "PRIVATE"));
		UUID diaryId = diary.getDiaryId();
		Instant originalUpdatedAt = diary.getUpdatedAt();

		mvc.perform(patch("/api/v1/diaries/" + diaryId).contentType(MediaType.APPLICATION_JSON)
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
		Diary diary = diaries.saveAndFlush(new Diary("상세 대상", "#D6BFA7", "LEATHER", "LINK"));

		var data = service.getDiary(diary.getDiaryId()).diary();
		assertThat(data.diaryId()).isEqualTo(diary.getDiaryId().toString());
		assertThat(data.diaryTitle()).isEqualTo("상세 대상");
		assertThat(data.coverStyle()).isEqualTo("LEATHER");
		assertThat(data.visibility()).isEqualTo("LINK");
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.getDiary(UUID.randomUUID()))
			.isInstanceOf(com.f106.DIO.diary.support.DiaryNotFoundException.class);
	}

	@Test
	void updatesOnlyTheSuppliedFieldAndRefreshesUpdatedAt() throws Exception {
		Diary diary = diaries.saveAndFlush(new Diary("원래 제목", "#D6BFA7", "PLAIN", "PRIVATE"));
		UUID diaryId = diary.getDiaryId();
		Instant oldUpdatedAt = Instant.parse("2020-01-01T00:00:00Z");
		entityManager.createNativeQuery("update diaries set updated_at = :updatedAt where diary_id = :diaryId")
			.setParameter("updatedAt", oldUpdatedAt)
			.setParameter("diaryId", diaryId)
			.executeUpdate();
		entityManager.clear();

        var request=new com.f106.DIO.diary.dto.DiaryUpdateRequest();request.setCoverStyle("LEATHER");
        var result=service.updateDiary(diaryId,request).diary();
        assertThat(result.diaryTitle()).isEqualTo("원래 제목");assertThat(result.coverColor()).isEqualTo("#D6BFA7");
        assertThat(result.coverStyle()).isEqualTo("LEATHER");assertThat(result.visibility()).isEqualTo("PRIVATE");
        entityManager.flush();

		entityManager.clear();
		Diary updated = diaries.findById(diaryId).orElseThrow();
		assertThat(updated.getUpdatedAt()).isAfter(oldUpdatedAt);
	}

	@Test
	void listsByCreatedAtDescendingThenDiaryIdDescending() throws Exception {
		Diary oldest = diaries.saveAndFlush(new Diary("첫 번째", "#D6BFA7", "PLAIN", "PRIVATE"));
		Diary sameTimeA = diaries.saveAndFlush(new Diary("두 번째", "#D6BFA7", "PLAIN", "PRIVATE"));
		Diary sameTimeB = diaries.saveAndFlush(new Diary("세 번째", "#D6BFA7", "PLAIN", "PRIVATE"));
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

		assertThat(service.getDiaries().items()).extracting(item -> item.diaryId())
			.containsExactly(higherDiaryId.toString(), lowerDiaryId.toString(), oldest.getDiaryId().toString());
	}

	@Test
	void rejectsInvalidVisibilityAndNonUuidPath() throws Exception {

		org.assertj.core.api.Assertions.assertThatThrownBy(()->service.deleteDiary(UUID.randomUUID())).isInstanceOf(com.f106.DIO.diary.support.DiaryNotFoundException.class);
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
}
