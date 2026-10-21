package com.f106.DIO.diary;

import java.math.BigDecimal;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"dio.diary.formats.1.width=1280", "dio.diary.formats.1.height=800"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DiaryDeletePersistenceTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;
	@Autowired EntityManager entityManager;

	private Diary fixture(String title) {
		return diaries.saveAndFlush(new Diary(title, "#D6BFA7", "LINEN", "RING", "1",
			new BigDecimal("1280"), new BigDecimal("800"), "BLANK"));
	}

	@Test
	void deletesOnlyRequestedRowAndRemovesItFromReads() throws Exception {
		Long target = fixture("삭제 대상").getDiaryId();
		Long other = fixture("유지 대상").getDiaryId();
		mvc.perform(delete("/api/v1/diaries/" + target))
			.andExpect(status().isNoContent()).andExpect(content().string(""))
			.andExpect(header().doesNotExist("Content-Type"));
		entityManager.clear();
		assertThat(diaries.existsById(target)).isFalse();
		assertThat(diaries.findById(other).orElseThrow().getTitle()).isEqualTo("유지 대상");
		mvc.perform(get("/api/v1/diaries/" + target))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
		mvc.perform(get("/api/v1/diaries"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
			.andExpect(jsonPath("$.items[0].diaryId").value(other.toString()));
		mvc.perform(delete("/api/v1/diaries/" + target))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
	}

	@Test
	void missingIdDoesNotDeleteOtherRows() throws Exception {
		Long other = fixture("유지 대상").getDiaryId();
		mvc.perform(delete("/api/v1/diaries/9223372036854775807"))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
		assertThat(diaries.existsById(other)).isTrue();
		assertThat(diaries.count()).isEqualTo(1);
	}
}
