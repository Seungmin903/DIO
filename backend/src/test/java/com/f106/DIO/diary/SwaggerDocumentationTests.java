package com.f106.DIO.diary;

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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SwaggerDocumentationTests {

	@Autowired
	private MockMvc mvc;

	@Test
	void servesOpenApiWithAuthenticatedDiaryOperations() throws Exception {
		mvc.perform(get("/v3/api-docs"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.info.title").value("DIO 개발 API"))
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].post").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].get").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].get").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].patch").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].delete.responses['204'].content").doesNotExist())
			.andExpect(jsonPath("$.info.description").value(not(containsString("501"))))
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].post.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].get.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].get.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].patch.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].delete.responses['501']").doesNotExist())
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].post.responses['201'].content['application/json'].schema['$ref']").value("#/components/schemas/DiaryCreateResponse"))
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].get.responses['200']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].get.responses['200']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].patch.responses['200']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].delete.responses['204']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}'].get.responses['404']").exists())
			.andExpect(jsonPath("$.components.schemas.DiaryCreateRequest.properties.diaryTitle.example").value("여행 다이어리"))
			.andExpect(jsonPath("$.components.schemas.DiaryUpdateRequest.properties.anyFieldPresent").doesNotExist())
			.andExpect(jsonPath("$.security").doesNotExist())
			.andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"))
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].get.security[0].bearerAuth").exists());
	}

	@Test
	void documentsNotificationsAlongsideExistingApiGroups() throws Exception {
		mvc.perform(get("/v3/api-docs"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.paths['/api/v1/auth/login'].post").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].get").exists())
			.andExpect(jsonPath("$.paths['/api/v1/pages/{pageId}'].get").exists())
			.andExpect(jsonPath("$.paths['/api/v1/notifications'].get").exists())
			.andExpect(jsonPath("$.paths['/api/v1/notifications/unread-count'].get").exists())
			.andExpect(jsonPath("$.paths['/api/v1/notifications/{notificationId}'].patch").exists())
			.andExpect(jsonPath("$.paths['/api/v1/notifications/{notificationId}'].delete").exists())
			.andExpect(jsonPath("$.paths['/api/v1/notifications'].get.tags[0]").value("알림"))
			.andExpect(jsonPath("$.paths['/api/v1/notifications/unread-count'].get.tags[0]").value("알림"))
			.andExpect(jsonPath("$.paths['/api/v1/notifications/{notificationId}'].patch.tags[0]").value("알림"))
			.andExpect(jsonPath("$.paths['/api/v1/notifications/{notificationId}'].delete.tags[0]").value("알림"))
			.andExpect(jsonPath("$.paths['/api/v1/notifications'].get.security[0].bearerAuth").exists())
			.andExpect(jsonPath("$.paths['/api/v1/notifications'].get.responses['401'].content['application/problem+json'].schema['$ref']").value("#/components/schemas/NotificationAuthenticationProblem"))
			.andExpect(jsonPath("$.paths['/api/v1/notifications/{notificationId}'].patch.responses['404']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/notifications/{notificationId}'].delete.responses['204'].content").doesNotExist());
	}

	@Test
	void servesSwaggerUiWithoutToken() throws Exception {
		mvc.perform(get("/swagger-ui.html")).andExpect(status().is3xxRedirection());
		mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
	}

	@Test
	void healthEndpointIsPublicAndUp() throws Exception {
		// 배포 health 대기가 이 응답을 본다. 메일 서버 상태는 넣지 않는다(MailHealthConfigurationTests 가 운영 설정을 확인)
		mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
	}
}
