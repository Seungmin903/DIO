package com.f106.DIO.diary;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.f106.DIO.diary.controller.DiaryController;
import com.f106.DIO.diary.service.DiaryService;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 삭제 성공 계약만 검증한다. Service는 모킹되며 실제 데이터는 삭제하지 않는다. */
@WebMvcTest(DiaryController.class)
class DiaryDeleteContractTests {

	@Autowired
	private MockMvc mvc;

	@MockitoBean
	private DiaryService diaryService;

	@Test
	void returns204WithNoBodyWithoutAuthorization() throws Exception {
		mvc.perform(delete("/api/v1/diaries/1"))
			.andExpect(status().isNoContent())
			.andExpect(content().string(""))
			.andExpect(header().doesNotExist("Content-Type"));
		verify(diaryService).deleteDiary(1L);
	}

	@ParameterizedTest
	@ValueSource(strings = {"0", "-1", "abc", "9223372036854775808"})
	void rejectsInvalidIdBeforeCallingService(String id) throws Exception {
		mvc.perform(delete("/api/v1/diaries/" + id)).andExpect(status().isBadRequest());
		verifyNoInteractions(diaryService);
	}
}
