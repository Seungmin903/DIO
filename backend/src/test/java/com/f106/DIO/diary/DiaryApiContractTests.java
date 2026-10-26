package com.f106.DIO.diary;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.f106.DIO.diary.controller.DiaryController;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.dto.DiaryCreateResponse;
import com.f106.DIO.diary.dto.DiaryCreateResponse.DiaryData;
import com.f106.DIO.diary.dto.DiaryResponse;
import com.f106.DIO.diary.service.DiaryService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DiaryController.class)
class DiaryApiContractTests {

	private static final UUID DIARY_ID = UUID.fromString("1c4d5e6f-2a3b-4c5d-8e9f-0123456789ab");

	@Autowired MockMvc mvc;
	@MockitoBean DiaryService diaryService;

	private DiaryData data() {
		return new DiaryData(DIARY_ID.toString(), "여행 다이어리", "#D6BFA7", "PLAIN", "MEMBERS",
			Instant.parse("2026-10-20T04:00:00Z"), Instant.parse("2026-10-20T04:00:00Z"));
	}

	@Test
	void createsUuidDiaryWithTheNewMetadataContract() throws Exception {
		when(diaryService.createDiary(any())).thenReturn(new DiaryCreateResponse(data()));

		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON).content("""
			{"diaryTitle":"  여행 다이어리  ","coverColor":"#D6BFA7","coverStyle":"PLAIN","visibility":"MEMBERS"}
			"""))
			.andExpect(status().isCreated())
			.andExpect(header().string("Location", "/api/v1/diaries/" + DIARY_ID))
			.andExpect(jsonPath("$.diary.diaryId").value(DIARY_ID.toString()))
			.andExpect(jsonPath("$.diary.coverStyle").value("PLAIN"))
			.andExpect(jsonPath("$.diary.visibility").value("MEMBERS"))
			.andExpect(jsonPath("$.diary.formatId").doesNotExist());

		ArgumentCaptor<DiaryCreateRequest> request = ArgumentCaptor.forClass(DiaryCreateRequest.class);
		verify(diaryService).createDiary(request.capture());
		assertThat(request.getValue().diaryTitle()).isEqualTo("여행 다이어리");
	}

	@Test
	void usesSchemaDefaultsWhenOptionalMetadataIsOmitted() throws Exception {
		when(diaryService.createDiary(any())).thenReturn(new DiaryCreateResponse(data()));

		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{" + "\"diaryTitle\":\"기본 다이어리\"}"))
			.andExpect(status().isCreated());

		ArgumentCaptor<DiaryCreateRequest> request = ArgumentCaptor.forClass(DiaryCreateRequest.class);
		verify(diaryService).createDiary(request.capture());
		assertThat(request.getValue().coverColor()).isEqualTo("#CED9EE");
		assertThat(request.getValue().coverStyle()).isEqualTo("PLAIN");
		assertThat(request.getValue().visibility()).isEqualTo("PRIVATE");
	}

	@Test
	void acceptsOneHundredCharacterTitle() throws Exception {
		String title = "가".repeat(100);
		when(diaryService.createDiary(any())).thenReturn(new DiaryCreateResponse(data()));

		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"" + title + "\"}"))
			.andExpect(status().isCreated());

		ArgumentCaptor<DiaryCreateRequest> request = ArgumentCaptor.forClass(DiaryCreateRequest.class);
		verify(diaryService).createDiary(request.capture());
		assertThat(request.getValue().diaryTitle()).hasSize(100);
	}

	@Test
	void rejectsInvalidCreateFields() throws Exception {
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"   \"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"가" + "가".repeat(100) + "\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"기록\",\"coverColor\":\"blue\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"기록\",\"coverStyle\":\"\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"기록\",\"coverStyle\":\"   \"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"기록\",\"visibility\":\"PUBLIC\"}"))
			.andExpect(status().isBadRequest());

		verifyNoInteractions(diaryService);
	}

	@Test
	void updatesByUuid() throws Exception {
		when(diaryService.updateDiary(eq(DIARY_ID), any())).thenReturn(new DiaryResponse(data()));

		mvc.perform(patch("/api/v1/diaries/" + DIARY_ID).contentType(MediaType.APPLICATION_JSON)
			.content("{\"visibility\":\"MEMBERS\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.diary.visibility").value("MEMBERS"));
	}

	@Test
	void rejectsEmptyNullAndUnsupportedPatchFields() throws Exception {
		mvc.perform(patch("/api/v1/diaries/" + DIARY_ID).contentType(MediaType.APPLICATION_JSON)
			.content("{}"))
			.andExpect(status().isBadRequest());
		for (String field : new String[] {"diaryTitle", "coverColor", "coverStyle", "visibility"}) {
			mvc.perform(patch("/api/v1/diaries/" + DIARY_ID).contentType(MediaType.APPLICATION_JSON)
				.content("{\"" + field + "\":null}"))
				.andExpect(status().isBadRequest());
		}
		mvc.perform(patch("/api/v1/diaries/" + DIARY_ID).contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverStyle\":\"   \"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(patch("/api/v1/diaries/" + DIARY_ID).contentType(MediaType.APPLICATION_JSON)
			.content("{\"visibility\":\"PUBLIC\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(patch("/api/v1/diaries/" + DIARY_ID).contentType(MediaType.APPLICATION_JSON)
			.content("{\"formatId\":\"1\"}"))
			.andExpect(status().isBadRequest());

		verifyNoInteractions(diaryService);
	}
}
