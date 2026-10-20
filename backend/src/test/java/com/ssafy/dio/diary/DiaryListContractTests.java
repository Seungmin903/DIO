package com.ssafy.dio.diary;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ssafy.dio.diary.controller.DiaryController;
import com.ssafy.dio.diary.dto.DiaryCreateResponse.DiaryData;
import com.ssafy.dio.diary.dto.DiaryListResponse;
import com.ssafy.dio.diary.service.DiaryService;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Service 모킹으로 목록 계약만 검증한다. 실제 DB 조회 테스트가 아니다. */
@WebMvcTest(DiaryController.class)
class DiaryListContractTests {

	@Autowired
	private MockMvc mvc;

	@MockitoBean
	private DiaryService diaryService;

	@Test
	void returnsItemsMatchingCreationDiaryWithoutToken() throws Exception {
		Instant time = Instant.parse("2026-10-19T01:00:00Z");
		DiaryData diary = new DiaryData("1", "여행 다이어리", "#D6BFA7", "LINEN", "RING", "1",
			new BigDecimal("1600"), new BigDecimal("1200"), "BLANK", time, time);
		when(diaryService.getDiaries()).thenReturn(new DiaryListResponse(List.of(diary)));

		mvc.perform(get("/api/v1/diaries"))
			.andExpect(status().isOk())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
			.andExpect(content().json("""
				{"items":[{
				  "diaryId":"1", "diaryTitle":"여행 다이어리",
				  "coverColor":"#D6BFA7", "coverPattern":"LINEN", "bindingType":"RING",
				  "formatId":"1", "canvasWidth":1600, "canvasHeight":1200,
				  "defaultPageTemplate":"BLANK",
				  "createdAt":"2026-10-19T01:00:00Z", "updatedAt":"2026-10-19T01:00:00Z"
				}]}
				"""))
			.andExpect(jsonPath("$.items[0].diaryId").isString())
			.andExpect(jsonPath("$.items[0].formatId").isString())
			.andExpect(jsonPath("$.items[0].canvasWidth").isNumber())
			.andExpect(jsonPath("$.items[0].canvasHeight").isNumber());
		verify(diaryService).getDiaries();
	}

	@Test
	void returnsEmptyArrayWhenThereAreNoDiaries() throws Exception {
		when(diaryService.getDiaries()).thenReturn(new DiaryListResponse(List.of()));
		mvc.perform(get("/api/v1/diaries"))
			.andExpect(status().isOk())
			.andExpect(content().json("{\"items\":[]}"));
		verify(diaryService).getDiaries();
	}
}
