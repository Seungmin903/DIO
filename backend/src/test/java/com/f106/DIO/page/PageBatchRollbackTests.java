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

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 테스트 트랜잭션 없이 실행해 일괄 변경이 실제로 전부 취소되는지 확인한다. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PageBatchRollbackTests {

	@Autowired MockMvc mvc;

	@Test
	void rollsBackTheWholeBatchWhenOneChangeFails() throws Exception {
		String diaryId = JsonPath.read(mvc.perform(post("/api/v1/diaries").with(authenticated())
				.contentType(MediaType.APPLICATION_JSON).content("{\"diaryTitle\":\"PAGE_ROLLBACK_TEST\"}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.diary.diaryId");
		String pageId = JsonPath.read(mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages").with(authenticated())
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.page.pageId");

		mvc.perform(post("/api/v1/pages/" + pageId + "/elements/batch").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content("""
			{"creates":[{"elementId":"%s","type":"TEXT","x":0,"y":0,"w":1,"h":1}],"deleteElementIds":["%s"]}
			""".formatted(UUID.randomUUID(), UUID.randomUUID())))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("CANVAS_ELEMENT_NOT_FOUND"));

		mvc.perform(get("/api/v1/pages/" + pageId).with(authenticated())).andExpect(jsonPath("$.elements", hasSize(0)));
	}

	private static org.springframework.test.web.servlet.request.RequestPostProcessor authenticated() {
		// 커밋되는 테스트라 다른 테스트의 사용자 ID와 겹치지 않게 한다.
		return jwt().jwt(token -> token.subject("201"));
	}
}
