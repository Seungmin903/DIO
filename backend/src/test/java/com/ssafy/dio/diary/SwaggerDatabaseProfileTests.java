package com.ssafy.dio.diary;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"dio.diary.formats.1.width=1280", "dio.diary.formats.1.height=800"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SwaggerDatabaseProfileTests {

	@Autowired MockMvc mvc;

	@Test
	void databaseProfileDocumentsImplementedResponsesWithout501() throws Exception {
		mvc.perform(get("/v3/api-docs"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.info.description").value(not(containsString("501"))))
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].post.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].get.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].get.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].patch.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].delete.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].post.responses['201']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].get.responses['200']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].get.responses['200']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].patch.responses['200']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].delete.responses['204']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].delete.responses['204'].content").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].get.responses['404']").exists());
	}
}
