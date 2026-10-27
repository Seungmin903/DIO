package com.f106.DIO.page;

import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 테스트 트랜잭션 없이 실행해 일괄 변경이 실제로 전부 취소되는지 확인한다. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PageBatchRollbackTests {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;

	@Test
	void rollsBackTheWholeBatchWhenOneChangeFails() throws Exception {
		UUID diaryId = diaries.saveAndFlush(new Diary("PAGE_ROLLBACK_TEST", "#D6BFA7", "PLAIN", "PRIVATE")).getDiaryId();
		String pageId = JsonPath.read(mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages")
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.page.pageId");

		mvc.perform(post("/api/v1/pages/" + pageId + "/elements/batch").contentType(MediaType.APPLICATION_JSON).content("""
			{"creates":[{"elementId":"%s","type":"TEXT","x":0,"y":0,"w":1,"h":1}],"deleteElementIds":["%s"]}
			""".formatted(UUID.randomUUID(), UUID.randomUUID())))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("ELEMENT_NOT_FOUND"));

		mvc.perform(get("/api/v1/pages/" + pageId)).andExpect(jsonPath("$.elements", hasSize(0)));
	}
}
