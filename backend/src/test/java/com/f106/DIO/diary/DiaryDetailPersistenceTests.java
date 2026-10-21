package com.f106.DIO.diary;

import java.math.BigDecimal;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"dio.diary.formats.1.width=1280", "dio.diary.formats.1.height=800"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DiaryDetailPersistenceTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;

	@Test
	void returnsRequestedDiaryWithStoredFieldsAndLeavesTimestampsUnchanged() throws Exception {
		diaries.saveAndFlush(new Diary("다른 기록", "#FFFFFF", "DOT", "RING", "1",
			BigDecimal.ONE, BigDecimal.ONE, "WEEKLY"));
		Diary target = diaries.saveAndFlush(new Diary("여행 다이어리", "#D6BFA7", "LINEN", "RING", "1",
			new BigDecimal("1280"), new BigDecimal("800"), "BLANK"));
		var time = target.getUpdatedAt();
		mvc.perform(get("/api/v1/diaries/" + target.getDiaryId()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.diary.diaryId").value(target.getDiaryId().toString()))
			.andExpect(jsonPath("$.diary.diaryTitle").value("여행 다이어리"))
			.andExpect(jsonPath("$.diary.coverColor").value("#D6BFA7"))
			.andExpect(jsonPath("$.diary.coverPattern").value("LINEN"))
			.andExpect(jsonPath("$.diary.bindingType").value("RING"))
			.andExpect(jsonPath("$.diary.formatId").value("1"))
			.andExpect(jsonPath("$.diary.canvasWidth").value(1280))
			.andExpect(jsonPath("$.diary.canvasHeight").value(800))
			.andExpect(jsonPath("$.diary.defaultPageTemplate").value("BLANK"))
			.andExpect(jsonPath("$.diary.createdAt").isNotEmpty())
			.andExpect(jsonPath("$.diary.updatedAt").isNotEmpty());
		assertThat(diaries.findById(target.getDiaryId()).orElseThrow().getUpdatedAt()).isEqualTo(time);
	}

	@Test
	void absentDiaryReturns404ProblemDetail() throws Exception {
		mvc.perform(get("/api/v1/diaries/9223372036854775807"))
			.andExpect(status().isNotFound())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.status").value(404))
			.andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
	}
}
