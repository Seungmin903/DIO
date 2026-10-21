package com.f106.DIO.diary;

import java.math.BigDecimal;
import java.util.Map;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.config.DiaryFormatProperties;
import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.diary.service.DiaryService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"dio.diary.formats.1.width=1280", "dio.diary.formats.1.height=800"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DiaryCreationPersistenceTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;
	@Autowired DiaryService service;
	@Autowired EntityManager entityManager;
	@Autowired DiaryFormatProperties formats;

	static final String REQUEST = """
		{"diaryTitle":"  여행 다이어리  ","coverColor":"#D6BFA7","coverPattern":"LINEN",
		 "bindingType":"RING","formatId":"1","defaultPageTemplate":"BLANK"}
		""";

	@Test
	void createsAndReloadsDiaryWithServerDimensionsAndNoOwner() throws Exception {
		long before = diaries.count();
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
			.andExpect(status().isCreated())
			.andExpect(header().exists("Location"))
			.andExpect(jsonPath("$.diary.diaryId").isString())
			.andExpect(jsonPath("$.diary.diaryTitle").value("여행 다이어리"))
			.andExpect(jsonPath("$.diary.canvasWidth").value(1280))
			.andExpect(jsonPath("$.diary.canvasHeight").value(800))
			.andExpect(jsonPath("$.diary.createdAt").isNotEmpty());
		entityManager.clear();
		assertThat(diaries.count()).isEqualTo(before + 1);
		Diary diary = diaries.findAll().get(0);
		assertThat(diary.getTitle()).isEqualTo("여행 다이어리");
		assertThat(diary.getOwnerUserId()).isNull();
		assertThat(diary.getCoverStyle()).isEqualTo("LINEN");
		assertThat(diary.getDefaultPageTemplate()).isEqualTo("BLANK");
		assertThat(diary.getCreatedAt()).isEqualTo(diary.getUpdatedAt());
	}

	@Test
	void unknownFormatDoesNotInsertDiary() throws Exception {
		long before = diaries.count();
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(REQUEST.replace("\"formatId\":\"1\"", "\"formatId\":\"unknown\"")))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_DIARY_FORMAT"));
		assertThat(diaries.count()).isEqualTo(before);
	}

	@Test
	void invalidRequestDoesNotInsertDiary() throws Exception {
		long before = diaries.count();
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(REQUEST.replace("#D6BFA7", "red"))).andExpect(status().isBadRequest());
		assertThat(diaries.count()).isEqualTo(before);
	}

	@Test
	void laterFormatChangeDoesNotChangeExistingDiarySize() {
		var response = service.createDiary(new DiaryCreateRequest("기록", "#D6BFA7", "LINEN", "RING", "1", "BLANK"));
		Map<String, DiaryFormatProperties.Dimensions> original = formats.getFormats();
		try {
			formats.setFormats(Map.of("1", new DiaryFormatProperties.Dimensions(new BigDecimal("1600"), new BigDecimal("1000"))));
			entityManager.clear();
			Diary saved = diaries.findById(Long.valueOf(response.diary().diaryId())).orElseThrow();
			assertThat(saved.getCanvasWidth()).isEqualByComparingTo("1280");
			assertThat(saved.getCanvasHeight()).isEqualByComparingTo("800");
		} finally {
			formats.setFormats(original);
		}
	}
}
