package com.f106.DIO.page;

import java.time.Instant;
import java.util.UUID;

import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** local PostgreSQL(Flyway V1)의 pages·canvas_elements(jsonb 포함)에서 같은 흐름을 검증한다. 테스트 행은 롤백된다. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "dio.postgres-test", matches = "true")
@Transactional
class PostgresPageApiTests {

	@Autowired MockMvc mvc;
	@Autowired UserRepository users;
	private Long ownerUserId;

	/** diaries.owner_user_id는 users FK라서 로컬 DB에 실제 사용자 행을 만든다. 테스트 트랜잭션과 함께 롤백된다. */
	@BeforeEach
	void createOwner() {
		String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
		ownerUserId = users.saveAndFlush(new User("postgres-page-" + suffix + "@example.com", "페이지" + suffix.substring(0, 4), Instant.now())).getUserId();
	}

	@Test
	void pagesAndCanvasElementsUseTheAuthenticatedPostgresContract() throws Exception {
		String diaryId = JsonPath.read(mvc.perform(post("/api/v1/diaries").with(authenticated())
				.contentType(MediaType.APPLICATION_JSON).content("{\"diaryTitle\":\"POSTGRES_PAGE_TEST\"}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.diary.diaryId");
		String firstPageId = createPage(diaryId);
		String secondPageId = createPage(diaryId);

		mvc.perform(patch("/api/v1/diaries/" + diaryId + "/pages/order").with(authenticated())
				.contentType(MediaType.APPLICATION_JSON).content("{\"pageIds\":[\"" + secondPageId + "\",\"" + firstPageId + "\"]}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.items[0].pageId").value(secondPageId));

		String elementId = UUID.randomUUID().toString();
		mvc.perform(post("/api/v1/pages/" + firstPageId + "/elements/batch").with(authenticated())
				.contentType(MediaType.APPLICATION_JSON).content("{\"creates\":[{\"elementId\":\"" + elementId + "\",\"type\":\"TEXT\",\"x\":0,\"y\":0,\"w\":10,\"h\":10}]}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(1)));
		mvc.perform(delete("/api/v1/pages/" + firstPageId + "/elements/" + elementId).with(authenticated()))
			.andExpect(status().isOk());
		mvc.perform(post("/api/v1/pages/" + firstPageId + "/copies").with(authenticated()))
			.andExpect(status().isCreated());
	}

	private String createPage(String diaryId) throws Exception {
		return JsonPath.read(mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages").with(authenticated())
				.contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.page.pageId");
	}

	private RequestPostProcessor authenticated() {
		return jwt().jwt(token -> token.subject(ownerUserId.toString()));
	}
}
