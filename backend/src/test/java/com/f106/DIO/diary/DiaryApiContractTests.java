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

@WebMvcTest(com.f106.DIO.diary.update.AccountDiaryUpdateController.class)
class DiaryApiContractTests {

	private static final UUID DIARY_ID = UUID.fromString("1c4d5e6f-2a3b-4c5d-8e9f-0123456789ab");

	@Autowired MockMvc mvc;
	@MockitoBean com.f106.DIO.diary.update.AccountDiaryUpdateService diaryService;

	private DiaryData data() {
		return new DiaryData(DIARY_ID.toString(), "여행 다이어리", "#D6BFA7", "PLAIN", "MEMBERS",
			Instant.parse("2026-10-20T04:00:00Z"), Instant.parse("2026-10-20T04:00:00Z"));
	}

	// Authenticated creation and strict input checks live in DiaryCreationHttpTests.
    @Test void requiresAuthenticatedPrincipalForValidPatch() throws Exception {
        mvc.perform(patch("/api/v1/diaries/"+DIARY_ID).contentType(MediaType.APPLICATION_JSON)
            .content("{\"expectedVersion\":\"1\",\"diaryTitle\":\"Changed\"}"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(diaryService);
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
