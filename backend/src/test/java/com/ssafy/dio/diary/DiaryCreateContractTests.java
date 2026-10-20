package com.ssafy.dio.diary;

import java.math.BigDecimal;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ssafy.dio.diary.controller.DiaryController;
import com.ssafy.dio.diary.dto.DiaryCreateRequest;
import com.ssafy.dio.diary.dto.DiaryCreateResponse;
import com.ssafy.dio.diary.service.DiaryService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Service를 모킹하여 성공 응답 계약만 검증한다. 실제 생성 성공을 의미하지 않는다. */
@WebMvcTest(DiaryController.class)
class DiaryCreateContractTests {

	private static final String REQUEST = """
		{
		  "diaryTitle": "  여행 다이어리  ",
		  "coverColor": "#D6BFA7",
		  "coverPattern": "LINEN",
		  "bindingType": "RING",
		  "formatId": "1",
		  "defaultPageTemplate": "BLANK"
		}
		""";

	@Autowired
	private MockMvc mvc;

	@MockitoBean
	private DiaryService diaryService;

	@Test
	void createsResponseEnvelopeWithStringIdsAndNumericDimensionsWithoutToken() throws Exception {
		Instant now = Instant.parse("2026-10-19T01:00:00Z");
		when(diaryService.createDiary(any())).thenReturn(new DiaryCreateResponse(
			new DiaryCreateResponse.DiaryData("1", "여행 다이어리", "#D6BFA7", "LINEN", "RING", "1",
				new BigDecimal("1600"), new BigDecimal("1200"), "BLANK", now, now)));

		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
			.andExpect(status().isCreated())
			.andExpect(header().string("Location", "/api/v1/diaries/1"))
			.andExpect(jsonPath("$.diary.diaryId").value("1"))
			.andExpect(jsonPath("$.diary.diaryId").isString())
			.andExpect(jsonPath("$.diary.diaryTitle").value("여행 다이어리"))
			.andExpect(jsonPath("$.diary.coverColor").value("#D6BFA7"))
			.andExpect(jsonPath("$.diary.coverPattern").value("LINEN"))
			.andExpect(jsonPath("$.diary.bindingType").value("RING"))
			.andExpect(jsonPath("$.diary.formatId").value("1"))
			.andExpect(jsonPath("$.diary.formatId").isString())
			.andExpect(jsonPath("$.diary.canvasWidth").value(1600))
			.andExpect(jsonPath("$.diary.canvasWidth").isNumber())
			.andExpect(jsonPath("$.diary.canvasHeight").value(1200))
			.andExpect(jsonPath("$.diary.defaultPageTemplate").value("BLANK"))
			.andExpect(jsonPath("$.diary.createdAt").value("2026-10-19T01:00:00Z"))
			.andExpect(jsonPath("$.diary.updatedAt").value("2026-10-19T01:00:00Z"));

		ArgumentCaptor<DiaryCreateRequest> captor = ArgumentCaptor.forClass(DiaryCreateRequest.class);
		verify(diaryService).createDiary(captor.capture());
		assertThat(captor.getValue().diaryTitle()).isEqualTo("여행 다이어리");
		assertThat(captor.getValue().formatId()).isEqualTo("1");
	}

	@Test
	void validatesTitleLengthAfterTrimming() throws Exception {
		String title = "a".repeat(100);
		when(diaryService.createDiary(any())).thenReturn(new DiaryCreateResponse(
			new DiaryCreateResponse.DiaryData("1", title, "#D6BFA7", "LINEN", "RING", "1",
				BigDecimal.ONE, BigDecimal.ONE, "BLANK", Instant.EPOCH, Instant.EPOCH)));
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(REQUEST.replace("  여행 다이어리  ", "  " + title + "  ")))
			.andExpect(status().isCreated());
		verify(diaryService).createDiary(org.mockito.ArgumentMatchers.argThat(request -> request.diaryTitle().equals(title)));
	}

	@Test
	void rejectsWhitespaceTitleBeforeCallingService() throws Exception {
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(REQUEST.replace("  여행 다이어리  ", "   ")))
			.andExpect(status().isBadRequest());
		verifyNoInteractions(diaryService);
	}

	@Test
	void rejectsMissingFormatIdBeforeCallingService() throws Exception {
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(REQUEST.replace("\"formatId\": \"1\",", "")))
			.andExpect(status().isBadRequest());
		verifyNoInteractions(diaryService);
	}
}
