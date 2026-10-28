package com.f106.DIO.page;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.page.domain.PageTemplate;
import com.f106.DIO.page.repository.PageTemplateRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class PageApiTests {

	@Autowired MockMvc mvc;
	@Autowired PageTemplateRepository pageTemplateRepository;
	@Autowired DiaryMemberRepository diaryMemberRepository;
	private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired org.springframework.jdbc.core.JdbcTemplate boundaryJdbc;
    @org.junit.jupiter.api.BeforeEach void memberReceiptFixture() {
        boundaryJdbc.execute("create table if not exists diary_creation_receipts(user_id bigint,key_hash char(64),request_hash char(64),diary_id uuid,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
    }

	@Test
	void pagesAndCanvasElementsSupportTheWholePersistenceFlow() throws Exception {
		String diaryId = body(mvc.perform(post("/api/v1/diaries").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"페이지 API 검증\"}"))
			.andExpect(status().isCreated()).andReturn()).at("/diary/diaryId").asText();

		String pageId = body(mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages").with(authenticated())
			.contentType(MediaType.APPLICATION_JSON).content("""
				{"title":"  첫 페이지  ","canvasWidth":1024,"canvasHeight":768,"gridVisible":true,"gridColor":"#AABBCC"}
				"""))
			.andExpect(status().isCreated()).andExpect(header().string("Location", org.hamcrest.Matchers.matchesPattern("/api/v1/pages/.+")))
			.andExpect(jsonPath("$.page.title").value("첫 페이지")).andReturn()).at("/page/pageId").asText();

		String elementId = body(mvc.perform(post("/api/v1/pages/" + pageId + "/elements").with(authenticated())
			.contentType(MediaType.APPLICATION_JSON).content("""
				{"type":"text","name":"  오늘의 기록  ","x":10,"y":20,"w":300,"h":80,"propertiesJson":{"text":"안녕"}}
				"""))
			.andExpect(status().isCreated()).andExpect(jsonPath("$.element.elementType").value("TEXT"))
			.andExpect(jsonPath("$.element.width").value(300)).andReturn()).at("/element/elementId").asText();

		mvc.perform(patch("/api/v1/pages/" + pageId + "/elements/" + elementId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"version\":1,\"x\":42,\"isLocked\":true}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.element.x").value(42))
			.andExpect(jsonPath("$.element.isLocked").value(true));

		String copiedPageId = body(mvc.perform(post("/api/v1/pages/" + pageId + "/copies").with(authenticated()))
			.andExpect(status().isCreated()).andReturn()).at("/page/pageId").asText();
		JsonNode copiedDetail = body(mvc.perform(get("/api/v1/pages/" + copiedPageId).with(authenticated()))
			.andExpect(status().isOk()).andExpect(jsonPath("$.elements.length()").value(1)).andReturn());
		String copiedElementId = copiedDetail.at("/elements/0/elementId").asText();
		assertThat(copiedElementId).isNotEqualTo(elementId);

		mvc.perform(post("/api/v1/pages/" + copiedPageId + "/elements/batch").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("""
				{"updates":[{"elementId":"%s","version":1,"isHidden":true}],"creates":[{"type":"STICKER","x":1,"y":2,"w":30,"h":40}]}
				""".formatted(copiedElementId)))
			.andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2));

		mvc.perform(delete("/api/v1/pages/" + copiedPageId + "/elements/" + copiedElementId).with(authenticated()))
			.andExpect(status().isOk());
		mvc.perform(post("/api/v1/pages/" + copiedPageId + "/elements/" + copiedElementId + "/restore").with(authenticated()))
			.andExpect(status().isOk()).andExpect(jsonPath("$.element.isHidden").value(true));

		mvc.perform(delete("/api/v1/pages/" + pageId).with(authenticated())).andExpect(status().isNoContent());
		mvc.perform(get("/api/v1/pages/" + pageId).with(authenticated())).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("PAGE_NOT_FOUND"));
		mvc.perform(patch("/api/v1/diaries/" + diaryId + "/pages/order").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"pageIds\":[\"" + copiedPageId + "\"]}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
	}

	@Test
	void unknownDiaryUsesTheApiProblemContract() throws Exception {
		mvc.perform(get("/api/v1/diaries/" + UUID.randomUUID() + "/pages").with(authenticated()))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
	}

	@Test
	void savedDiaryContentRequiresLoginAndRejectsAnotherUser() throws Exception {
		mvc.perform(get("/api/v1/diaries"))
			.andExpect(status().isUnauthorized());

		String diaryId = createDiary("소유권 검증");
		mvc.perform(get("/api/v1/diaries/" + diaryId).with(authenticated("102")))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("DIARY_ACCESS_DENIED"));
	}

	@Test
	void membershipRolesControlWritesDeletionAndDiaryLists() throws Exception {
		String diaryId = createDiary("역할 검증");
		UUID id = UUID.fromString(diaryId);
		diaryMemberRepository.saveAndFlush(new DiaryMember(id, 102L, "EDITOR"));
		diaryMemberRepository.saveAndFlush(new DiaryMember(id, 103L, "VIEWER"));
		DiaryMember departed = new DiaryMember(id, 104L, "EDITOR");
		setField(departed, "leftAt", Instant.now());
		diaryMemberRepository.saveAndFlush(departed);

		mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages").with(authenticated("102"))
			.contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isCreated());
		mvc.perform(get("/api/v1/diaries/" + diaryId + "/pages").with(authenticated("103")))
			.andExpect(status().isOk());
		mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages").with(authenticated("103"))
			.contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIARY_ACCESS_DENIED"));
		mvc.perform(delete("/api/v1/diaries/" + diaryId).with(authenticated("102")))
			.andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIARY_ACCESS_DENIED"));
		mvc.perform(get("/api/v1/diaries").with(authenticated("102")))
			.andExpect(status().isOk()).andExpect(jsonPath("$.items[?(@.diaryId == '" + diaryId + "')]").isNotEmpty());
		mvc.perform(get("/api/v1/diaries/" + diaryId).with(authenticated("104")))
			.andExpect(status().isForbidden());
	}

	@Test
	void swaggerFormInputsCreateAndUpdatePagesAndElements() throws Exception {
		String diaryId = createDiary("폼 입력 검증");
		String pageId = body(mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages").with(authenticated())
			.contentType(MediaType.APPLICATION_FORM_URLENCODED)
			.param("title", "폼 페이지")
			.param("canvasWidth", "1024")
			.param("canvasHeight", "768")
			.param("gridVisible", "true")
			.param("gridColor", "#AABBCC")
			.param("templateConfig", "{\"paperColor\":\"#FFFDF7\"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.page.title").value("폼 페이지"))
			.andReturn()).at("/page/pageId").asText();

		String elementId = body(mvc.perform(post("/api/v1/pages/" + pageId + "/elements").with(authenticated())
			.contentType(MediaType.APPLICATION_FORM_URLENCODED)
			.param("type", "text")
			.param("name", "폼 텍스트")
			.param("x", "10")
			.param("y", "20")
			.param("w", "300")
			.param("h", "80")
			.param("propertiesJson", "{\"text\":\"안녕하세요\"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.element.elementType").value("TEXT"))
			.andExpect(jsonPath("$.element.propertiesJson.text").value("안녕하세요"))
			.andReturn()).at("/element/elementId").asText();

		mvc.perform(patch("/api/v1/pages/" + pageId + "/elements/" + elementId).with(authenticated())
			.contentType(MediaType.APPLICATION_FORM_URLENCODED)
			.param("version", "1")
			.param("x", "42")
			.param("locked", "true"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.element.x").value(42))
			.andExpect(jsonPath("$.element.isLocked").value(true));

		mvc.perform(get("/v3/api-docs"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/pages'].post.requestBody.content['application/json']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/pages'].post.requestBody.content['application/x-www-form-urlencoded']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/pages/{pageId}/elements'].post.requestBody.content['application/json']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/pages/{pageId}/elements'].post.requestBody.content['application/x-www-form-urlencoded']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/pages'].post.security[0].bearerAuth").exists())
			.andExpect(jsonPath("$.paths['/api/v1/pages/{pageId}'].delete.responses['204']").exists())
			.andExpect(jsonPath("$.paths['/api/v1/pages/{pageId}/copies'].post.responses['201'].content['application/json']").exists())
			.andExpect(jsonPath("$.components.schemas.PageCreateForm.properties.title").exists())
			.andExpect(jsonPath("$.components.schemas.CanvasElementCreateForm.properties.type").exists());
	}

	@Test
	void batchRejectsNullItemsAndOversizedPropertiesJson() throws Exception {
		String diaryId=createDiary("배치 검증");
		String pageId=createPage(diaryId,"{}");
		for(String request:List.of("{\"creates\":[null]}","{\"updates\":[null]}","{\"deleteElementIds\":[null]}","{\"restoreElementIds\":[null]}")){
			mvc.perform(post("/api/v1/pages/"+pageId+"/elements/batch").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content(request))
				.andExpect(status().isBadRequest());
		}
		String oversized="x".repeat(128*1024);
		mvc.perform(post("/api/v1/pages/"+pageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"type\":\"TEXT\",\"x\":0,\"y\":0,\"w\":1,\"h\":1,\"propertiesJson\":{\"text\":\""+oversized+"\"}}"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void changingTemplateWithoutConfigResetsToTheTemplateDefault() throws Exception {
		String diaryId=createDiary("속지 설정");
		String pageId=createPage(diaryId,"{\"templateConfig\":{\"paperColor\":\"#FFFFFF\"}}");
		PageTemplate template=activeTemplate("lined",new BigDecimal("700.00"),new BigDecimal("900.00"),"{\"lineSpacing\":32}");

		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"templateId\":"+template.getTemplateId()+"}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.page.canvasWidth").value(700))
			.andExpect(jsonPath("$.page.canvasHeight").value(900))
			.andExpect(jsonPath("$.page.templateConfig.lineSpacing").value(32));
	}

	@Test
	void staleElementVersionIsRejectedInsteadOfOverwriting() throws Exception {
		String pageId=createPage(createDiary("버전 검증"),"{}");
		String elementId=createElement(pageId,"");

		mvc.perform(patch("/api/v1/pages/"+pageId+"/elements/"+elementId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"version\":1,\"x\":5}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.element.version").value(2));
		mvc.perform(patch("/api/v1/pages/"+pageId+"/elements/"+elementId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"version\":1,\"x\":9}"))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CANVAS_ELEMENT_VERSION_CONFLICT"));
		mvc.perform(post("/api/v1/pages/"+pageId+"/elements/batch").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"updates\":[{\"elementId\":\""+elementId+"\",\"version\":1,\"x\":9}]}"))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CANVAS_ELEMENT_VERSION_CONFLICT"));
		mvc.perform(patch("/api/v1/pages/"+pageId+"/elements/"+elementId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"x\":9}"))
			.andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/pages/"+pageId).with(authenticated())).andExpect(jsonPath("$.elements[0].x").value(5));
	}

	@Test
	void externalMediaAndOtherPageGroupsAreNotAccepted() throws Exception {
		String diaryId=createDiary("참조 검증");
		String pageId=createPage(diaryId,"{}");
		String otherPageId=createPage(diaryId,"{}");
		String groupId=UUID.randomUUID().toString();
		String elementId=createElement(pageId,",\"groupId\":\""+groupId+"\"");

		mvc.perform(post("/api/v1/pages/"+pageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"type\":\"PHOTO\",\"x\":0,\"y\":0,\"w\":1,\"h\":1,\"mediaFileId\":\""+UUID.randomUUID()+"\"}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MEDIA_FILE_NOT_SUPPORTED"));
		mvc.perform(patch("/api/v1/pages/"+pageId+"/elements/"+elementId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"version\":1,\"mediaFileId\":\""+UUID.randomUUID()+"\"}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MEDIA_FILE_NOT_SUPPORTED"));
		mvc.perform(post("/api/v1/pages/"+otherPageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"type\":\"TEXT\",\"x\":0,\"y\":0,\"w\":1,\"h\":1,\"groupId\":\""+groupId+"\"}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PAGE_REQUEST"));
		createElement(pageId,",\"groupId\":\""+groupId+"\"");

		String copiedPageId=body(mvc.perform(post("/api/v1/pages/"+pageId+"/copies").with(authenticated()))
			.andExpect(status().isCreated()).andReturn()).at("/page/pageId").asText();
		JsonNode copied=body(mvc.perform(get("/api/v1/pages/"+copiedPageId).with(authenticated())).andExpect(status().isOk()).andReturn());
		assertThat(copied.at("/elements/0/groupId").asText()).isNotEqualTo(groupId)
			.isEqualTo(copied.at("/elements/1/groupId").asText());
	}

	private String createElement(String pageId,String extraFields) throws Exception {
		return body(mvc.perform(post("/api/v1/pages/"+pageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"type\":\"TEXT\",\"x\":0,\"y\":0,\"w\":1,\"h\":1"+extraFields+"}"))
			.andExpect(status().isCreated()).andReturn()).at("/element/elementId").asText();
	}

	private String createDiary(String title) throws Exception {
		return body(mvc.perform(post("/api/v1/diaries").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\""+title+"\"}"))
			.andExpect(status().isCreated()).andReturn()).at("/diary/diaryId").asText();
	}

	private String createPage(String diaryId,String request) throws Exception {
		return body(mvc.perform(post("/api/v1/diaries/"+diaryId+"/pages").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content(request))
			.andExpect(status().isCreated()).andReturn()).at("/page/pageId").asText();
	}

	private PageTemplate activeTemplate(String code,BigDecimal width,BigDecimal height,String defaultConfig) throws Exception {
		var constructor=PageTemplate.class.getDeclaredConstructor(); constructor.setAccessible(true);
		PageTemplate template=constructor.newInstance();
		setField(template,"code",code); setField(template,"canvasWidth",width); setField(template,"canvasHeight",height);
		setField(template,"defaultConfig",defaultConfig); setField(template,"isActive",true);
		return pageTemplateRepository.saveAndFlush(template);
	}

	private static void setField(Object target,String name,Object value) throws ReflectiveOperationException {
		Field field=target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target,value);
	}

	private JsonNode body(org.springframework.test.web.servlet.MvcResult result) throws Exception {
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private static RequestPostProcessor authenticated() {
		// 이 클래스는 롤백하지 않으므로 다른 테스트가 쓰는 사용자 1과 겹치지 않는 ID를 쓴다.
		return authenticated("101");
	}

	private static RequestPostProcessor authenticated(String userId) {
		return jwt().jwt(token -> token.subject(userId));
	}
}
