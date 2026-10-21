package com.f106.DIO.diary;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"dio.diary.formats.1.width=1280", "dio.diary.formats.1.height=800"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DiaryValidationTests {

	private static final String VALID_REQUEST = """
		{
		  "diaryTitle": "여행 일기",
		  "coverColor": "#F2A7A0",
		  "coverPattern": "LINEN",
		  "bindingType": "RING",
		  "formatId": "1",
		  "defaultPageTemplate": "BLANK"
		}
		""";

	@Autowired
	private MockMvc mvc;

	@Autowired
	private org.springframework.context.ApplicationContext context;

	@Test
	void startsWithDataSource() {
		assertThat(context.getBeansOfType(javax.sql.DataSource.class)).isNotEmpty();
	}

	@ParameterizedTest
	@ValueSource(strings = {"여행 일기", "#F2A7A0", "LINEN", "RING", "1", "BLANK"})
	void blankRequiredFieldIsRejected(String value) throws Exception {
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(VALID_REQUEST.replace(value, ""))).andExpect(status().isBadRequest());
	}

	@ParameterizedTest
	@ValueSource(strings = {"#F2A7A0", "LINEN", "BLANK"})
	void invalidColorOrSelectionIsRejected(String value) throws Exception {
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(VALID_REQUEST.replace(value, "INVALID"))).andExpect(status().isBadRequest());
	}

	@Test
	void longTitleIsRejected() throws Exception {
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON)
			.content(VALID_REQUEST.replace("여행 일기", "a".repeat(101)))).andExpect(status().isBadRequest());
	}

	@ParameterizedTest
	@ValueSource(strings = {"0", "-1", "abc", "9223372036854775808"})
	void invalidIdIsRejected(String id) throws Exception {
		mvc.perform(get("/api/v1/diaries/" + id)).andExpect(status().isBadRequest());
	}

	@Test
	void malformedJsonIsRejected() throws Exception {
		mvc.perform(post("/api/v1/diaries").contentType(MediaType.APPLICATION_JSON).content("{"))
			.andExpect(status().isBadRequest());
	}
}
