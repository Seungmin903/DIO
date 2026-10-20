package com.ssafy.dio.diary;

import java.math.BigDecimal;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ssafy.dio.diary.controller.DiaryController;
import com.ssafy.dio.diary.dto.DiaryCreateResponse.DiaryData;
import com.ssafy.dio.diary.dto.DiaryResponse;
import com.ssafy.dio.diary.dto.DiaryUpdateRequest;
import com.ssafy.dio.diary.service.DiaryService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Service 모킹으로 PATCH의 입력·출력 계약을 검증한다. 실제 변경은 미구현이다. */
@WebMvcTest(DiaryController.class)
class DiaryUpdateContractTests {

	@Autowired
	private MockMvc mvc;

	@MockitoBean
	private DiaryService diaryService;

	private void stubResponse() {
		when(diaryService.updateDiary(eq(1L), any())).thenReturn(new DiaryResponse(new DiaryData(
			"1", "제주 여행", "#A8C8E8", "LEATHER", "RING", "1",
			new BigDecimal("1600"), new BigDecimal("1200"), "BLANK",
			Instant.parse("2026-10-19T01:00:00Z"), Instant.parse("2026-10-19T02:00:00Z"))));
	}

	@Test
	void returnsUpdatedDiaryWithoutTokenAndTrimsTitle() throws Exception {
		stubResponse();
		mvc.perform(patch("/api/v1/diaries/1").contentType(MediaType.APPLICATION_JSON).content("""
			{"diaryTitle":"  제주 여행  ","coverColor":"#A8C8E8","coverPattern":"LEATHER","bindingType":"RING"}
			"""))
			.andExpect(status().isOk())
			.andExpect(content().json("""
				{"diary":{"diaryId":"1","diaryTitle":"제주 여행","coverColor":"#A8C8E8",
				"coverPattern":"LEATHER","bindingType":"RING","formatId":"1",
				"canvasWidth":1600,"canvasHeight":1200,"defaultPageTemplate":"BLANK",
				"createdAt":"2026-10-19T01:00:00Z","updatedAt":"2026-10-19T02:00:00Z"}}
				"""));
		ArgumentCaptor<DiaryUpdateRequest> captor = ArgumentCaptor.forClass(DiaryUpdateRequest.class);
		verify(diaryService).updateDiary(eq(1L), captor.capture());
		assertThat(captor.getValue().getDiaryTitle()).isEqualTo("제주 여행");
	}

	@Test
	void acceptsColorOnlyAndLeavesOtherFieldsAbsent() throws Exception {
		stubResponse();
		mvc.perform(patch("/api/v1/diaries/1").contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverColor\":\"#A8C8E8\"}")).andExpect(status().isOk());
		ArgumentCaptor<DiaryUpdateRequest> captor = ArgumentCaptor.forClass(DiaryUpdateRequest.class);
		verify(diaryService).updateDiary(eq(1L), captor.capture());
		assertThat(captor.getValue().getCoverColor()).isEqualTo("#A8C8E8");
		assertThat(captor.getValue().getDiaryTitle()).isNull();
		assertThat(captor.getValue().getCoverPattern()).isNull();
		assertThat(captor.getValue().getBindingType()).isNull();
	}

	@ParameterizedTest
	@ValueSource(strings = {"{}", "null", "{", "{\"diaryTitle\":\"   \"}",
		"{\"coverColor\":\"red\"}", "{\"coverPattern\":\"UNKNOWN\"}", "{\"bindingType\":\" \"}",
		"{\"formatId\":\"2\"}", "{\"defaultPageTemplate\":\"WEEKLY\"}",
		"{\"diaryTitle\":\"title\",\"formatId\":\"2\"}"})
	void rejectsEmptyInvalidAndUnsupportedRequests(String body) throws Exception {
		mvc.perform(patch("/api/v1/diaries/1").contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isBadRequest());
		verifyNoInteractions(diaryService);
	}

	@ParameterizedTest
	@ValueSource(strings = {"diaryTitle", "coverColor", "coverPattern", "bindingType"})
	void rejectsExplicitNullEvenWithAnotherValidField(String field) throws Exception {
		String other = field.equals("coverColor") ? "\"diaryTitle\":\"title\"" : "\"coverColor\":\"#A8C8E8\"";
		mvc.perform(patch("/api/v1/diaries/1").contentType(MediaType.APPLICATION_JSON)
			.content("{\"" + field + "\":null," + other + "}"))
			.andExpect(status().isBadRequest());
		verifyNoInteractions(diaryService);
	}

	@Test
	void rejectsTitleLongerThan100AfterTrimming() throws Exception {
		mvc.perform(patch("/api/v1/diaries/1").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"" + "a".repeat(101) + "\"}"))
			.andExpect(status().isBadRequest());
		verifyNoInteractions(diaryService);
	}

	@ParameterizedTest
	@ValueSource(strings = {"0", "-1", "abc", "9223372036854775808"})
	void rejectsInvalidId(String id) throws Exception {
		mvc.perform(patch("/api/v1/diaries/" + id).contentType(MediaType.APPLICATION_JSON)
			.content("{\"coverColor\":\"#A8C8E8\"}")).andExpect(status().isBadRequest());
		verifyNoInteractions(diaryService);
	}
}
