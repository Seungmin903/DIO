package com.ssafy.dio.diary;

import java.math.BigDecimal;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ssafy.dio.diary.controller.DiaryController;
import com.ssafy.dio.diary.dto.DiaryCreateResponse.DiaryData;
import com.ssafy.dio.diary.dto.DiaryResponse;
import com.ssafy.dio.diary.service.DiaryService;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 상세 응답 계약 검증. 실제 저장 데이터의 존재 여부는 아직 조회하지 않는다. */
@WebMvcTest(DiaryController.class)
class DiaryDetailContractTests {

	@Autowired
	private MockMvc mvc;

	@MockitoBean
	private DiaryService diaryService;

	@Test
	void returnsDiaryEnvelopeAndPassesIdWithoutAuthorization() throws Exception {
		Instant time = Instant.parse("2026-10-19T01:00:00Z");
		when(diaryService.getDiary(1L)).thenReturn(new DiaryResponse(
			new DiaryData("1", "여행 다이어리", "#D6BFA7", "LINEN", "RING", "1",
				new BigDecimal("1600"), new BigDecimal("1200"), "BLANK", time, time)));

		mvc.perform(get("/api/v1/diaries/1"))
			.andExpect(status().isOk())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
			.andExpect(content().json("""
				{"diary":{
				  "diaryId":"1", "diaryTitle":"여행 다이어리",
				  "coverColor":"#D6BFA7", "coverPattern":"LINEN", "bindingType":"RING",
				  "formatId":"1", "canvasWidth":1600, "canvasHeight":1200,
				  "defaultPageTemplate":"BLANK",
				  "createdAt":"2026-10-19T01:00:00Z", "updatedAt":"2026-10-19T01:00:00Z"
				}}
				"""))
			.andExpect(jsonPath("$.diary.diaryId").isString())
			.andExpect(jsonPath("$.diary.formatId").isString())
			.andExpect(jsonPath("$.diary.canvasWidth").isNumber())
			.andExpect(jsonPath("$.diary.canvasHeight").isNumber());
		verify(diaryService).getDiary(1L);
	}

	@ParameterizedTest
	@ValueSource(strings = {"0", "-1", "abc", "9223372036854775808"})
	void rejectsInvalidIdBeforeCallingService(String id) throws Exception {
		mvc.perform(get("/api/v1/diaries/" + id)).andExpect(status().isBadRequest());
		verifyNoInteractions(diaryService);
	}
}
