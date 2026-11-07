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
        // JWT fixture subjects represent active accounts, as required by collaboration writes.
        for (long id : new long[]{101,102,103,104}) {
            boundaryJdbc.update("insert into users(user_id,email,nickname,nickname_key,profile_color,status,created_at,updated_at) select ?,?,?,?,'#6F9FC6', 'ACTIVE',current_timestamp,current_timestamp where not exists(select 1 from users where user_id=?)", id,"page-fixture-"+id+"@example.com","page-"+id,"page-"+id,id);
        }

        boundaryJdbc.execute("create table if not exists diary_creation_receipts(user_id bigint,key_hash char(64),request_hash char(64),diary_id uuid,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
    }

    @Test void excessiveAutomaticElementOrderReturns400AndCanBeRepaired()throws Exception{
        String diaryId=createDiary("순서 경계"),pageId=createPage(diaryId,"{}");
        String base="{\"type\":\"TEXT\",\"x\":0,\"y\":0,\"w\":10,\"h\":10";
        var large=body(mvc.perform(post("/api/v1/pages/"+pageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content(base+",\"sortKey\":9999999999.9999999999}"))
            .andExpect(status().isCreated()).andReturn()).path("element");
        mvc.perform(post("/api/v1/pages/"+pageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content(base+"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PAGE_REQUEST"));
        mvc.perform(post("/api/v1/pages/"+pageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content(base+",\"sortKey\":1}"))
            .andExpect(status().isCreated());
        mvc.perform(patch("/api/v1/pages/"+pageId+"/elements/"+large.path("elementId").asText()).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"sortKey\":2,\"version\":"+large.path("version").asLong()+"}"))
            .andExpect(status().isOk());
        mvc.perform(post("/api/v1/pages/"+pageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content(base+"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.element.sortKey").value(3));
    }

    @Test void automaticOrderAtTheNumericBoundaryFitsAndOverflowingBatchRollsBack()throws Exception{
        String diaryId=createDiary("일괄 순서 경계"),pageId=createPage(diaryId,"{}");
        String base="{\"type\":\"TEXT\",\"x\":0,\"y\":0,\"w\":10,\"h\":10";
        mvc.perform(post("/api/v1/pages/"+pageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content(base+",\"sortKey\":9999999998.9999999999}"))
            .andExpect(status().isCreated());
        long historyBefore=boundaryJdbc.queryForObject("select count(*) from canvas_history_operations where page_id=?",Long.class,java.util.UUID.fromString(pageId));
        mvc.perform(post("/api/v1/pages/"+pageId+"/elements/batch").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content("{\"creates\":["+base+"},"+base+"}]}"))
            .andExpect(status().isBadRequest());
        assertThat(boundaryJdbc.queryForObject("select count(*) from canvas_elements where page_id=?",Long.class,java.util.UUID.fromString(pageId))).isEqualTo(1);
        assertThat(boundaryJdbc.queryForObject("select count(*) from canvas_history_operations where page_id=?",Long.class,java.util.UUID.fromString(pageId))).isEqualTo(historyBefore);
        var response=body(mvc.perform(post("/api/v1/pages/"+pageId+"/elements").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content(base+"}"))
            .andExpect(status().isCreated()).andReturn());
        assertThat(boundaryJdbc.queryForObject("select max(sort_key) from canvas_elements where page_id=?",BigDecimal.class,java.util.UUID.fromString(pageId))).isEqualByComparingTo("9999999999.9999999999");
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

    @Test void changingTemplatePreservesTheOriginalCreationRequestId()throws Exception{
        String diaryId=createDiary("생성 식별자 보존");String nonce=java.util.UUID.randomUUID().toString();
        String pageId=createPage(diaryId,"{\"templateConfig\":{\"clientPageRequestId\":\""+nonce+"\"}}");
        PageTemplate template=activeTemplate("identity-lined",new BigDecimal("700.00"),new BigDecimal("900.00"),"{\"lineSpacing\":32}");
        mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":"+template.getTemplateId()+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.page.templateConfig.clientPageRequestId").value(nonce)).andExpect(jsonPath("$.page.templateConfig.lineSpacing").value(32));
    }


	@Test
	void pagesAddedByTemplateCodeAreLinkedToTheTemplateRow() throws Exception {
		String diaryId=createDiary("속지 코드 페이지");
		PageTemplate cover=versionedTemplate("link-cover-portrait",new BigDecimal("768.00"),new BigDecimal("1024.00"),"{}",true);
		PageTemplate other=versionedTemplate("link-monthly-portrait",new BigDecimal("768.00"),new BigDecimal("1024.00"),"{}",true);
		versionedTemplate("link-retired-portrait",new BigDecimal("768.00"),new BigDecimal("1024.00"),"{}",false);
		String config="{\"templateCode\":\"link-cover-portrait\",\"templateVersion\":\"1.0.0\",\"clientPageRequestId\":\"6f1c2a4e-0d1b-4c3a-9f5e-2b7d8c9e0a11\"}";
		// 앱처럼 templateId 없이 코드로 더하면 그 행에 연결된다(설정의 코드 · 버전은 옛 앱을 위해 그대로 둔다)
		var created=body(mvc.perform(post("/api/v1/diaries/"+diaryId+"/pages").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"canvasWidth\":768,\"canvasHeight\":1024,\"templateConfig\":"+config+"}"))
			.andExpect(status().isCreated()).andReturn());
		assertThat(created.at("/page/templateId").asLong()).isEqualTo(cover.getTemplateId());
		assertThat(created.at("/page/templateCode").asText()).isEqualTo("link-cover-portrait");
		assertThat(created.at("/page/templateConfig/templateCode").asText()).isEqualTo("link-cover-portrait");
		// 같은 요청을 다시 보내면(네트워크 재시도) 찾은 행으로 비교해 같은 페이지를 돌려준다
		mvc.perform(post("/api/v1/diaries/"+diaryId+"/pages").with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"canvasWidth\":768,\"canvasHeight\":1024,\"templateConfig\":"+config+"}"))
			.andExpect(jsonPath("$.page.pageId").value(created.at("/page/pageId").asText()));
		// 없는 코드 · 없는 버전 · 내린(비활성) 속지 · 버전 없는 코드 · templateId 와 어긋난 코드는 저장하지 않는다
		for (String bad:new String[]{
				"{\"templateConfig\":{\"templateCode\":\"link-cvoer-portrait\",\"templateVersion\":\"1.0.0\"}}",
				"{\"templateConfig\":{\"templateCode\":\"link-cover-portrait\",\"templateVersion\":\"9.9.9\"}}",
				"{\"templateConfig\":{\"templateCode\":\"link-retired-portrait\",\"templateVersion\":\"1.0.0\"}}",
				"{\"templateConfig\":{\"templateCode\":\"link-cover-portrait\"}}",
				"{\"templateId\":"+other.getTemplateId()+",\"templateConfig\":{\"templateCode\":\"link-cover-portrait\",\"templateVersion\":\"1.0.0\"}}"}) {
			mvc.perform(post("/api/v1/diaries/"+diaryId+"/pages").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content(bad))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PAGE_REQUEST"));
		}
		// templateId 와 같은 코드를 함께 보내도 된다
		createPage(diaryId,"{\"templateId\":"+cover.getTemplateId()+",\"templateConfig\":{\"templateCode\":\"link-cover-portrait\",\"templateVersion\":\"1.0.0\"}}");
		// 설정만으로 다른 속지 코드로 바꾸면 template_id 와 어긋나므로 거부한다(속지 변경은 templateId 로)
		String pageId=created.at("/page/pageId").asText();
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"templateCode\":\"link-monthly-portrait\",\"templateVersion\":\"1.0.0\"}}"))
			.andExpect(status().isBadRequest());
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":"+other.getTemplateId()+"}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.page.templateCode").value("link-monthly-portrait"));
		// 빈 종이 페이지도 설정만으로 속지가 되지 않는다
		String blankId=createPage(diaryId,"{\"templateConfig\":{\"blank\":true}}");
		mvc.perform(patch("/api/v1/pages/"+blankId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"templateCode\":\"link-cover-portrait\",\"templateVersion\":\"1.0.0\"}}"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void remoteTemplatePagesNeedAWellFormedRemoteTemplateOnCreateAndUpdate() throws Exception {
		String diaryId=createDiary("원격 속지 페이지");
		// 서버는 설정의 templateCode · templateVersion 으로 속지 행을 찾으므로 행이 있어야 한다
		versionedTemplate("dio-remote-portrait",new BigDecimal("768.00"),new BigDecimal("1024.00"),"{\"blank\":false}",true);
		versionedTemplate("2026-cover-portrait",new BigDecimal("768.00"),new BigDecimal("1024.00"),"{}",true);
		// 앱이 페이지를 더하는 방식: templateId 없이 설정의 templateCode 로 속지를 알린다
		String pageId=createPage(diaryId,"{\"templateConfig\":{\"templateCode\":\"dio-remote-portrait\",\"templateVersion\":\"1.0.0\",\"remoteTemplate\":\"spring-note\"}}");
		for (String bad:new String[]{"{\"templateCode\":\"dio-remote-portrait\"}","{\"templateCode\":\"dio-remote-portrait\",\"remoteTemplate\":123}",
				"{\"templateCode\":\"dio-remote-portrait\",\"remoteTemplate\":\"../Spring Note\"}","{\"templateCode\":\"dio-remote-portrait\",\"remoteTemplate\":\""+"a".repeat(41)+"\"}",
				"{\"templateCode\":\"2026-cover-portrait\",\"remoteTemplate\":\"spring-note\"}","{\"remoteTemplate\":\"spring-note\"}"}) {
			mvc.perform(post("/api/v1/diaries/"+diaryId+"/pages").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content("{\"templateConfig\":"+bad+"}"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PAGE_REQUEST"));
		}
		// templateId 로 원격 행을 고르면 그 행의 코드로 검사한다
		PageTemplate remote=activeTemplate("dio-remote-landscape",new BigDecimal("1024.00"),new BigDecimal("768.00"),"{\"blank\":false}");
		mvc.perform(post("/api/v1/diaries/"+diaryId+"/pages").with(authenticated()).contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":"+remote.getTemplateId()+"}"))
			.andExpect(status().isBadRequest());
		String rowPageId=createPage(diaryId,"{\"templateId\":"+remote.getTemplateId()+",\"templateConfig\":{\"remoteTemplate\":\"summer\"}}");
		// 같은 원격 행을 templateId 만으로 다시 지정하면 저장된 remoteTemplate 을 이어받는다
		mvc.perform(patch("/api/v1/pages/"+rowPageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":"+remote.getTemplateId()+"}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.page.templateConfig.remoteTemplate").value("summer"));
		// 수정도 같은 규칙: 원격 페이지의 remoteTemplate 을 깨뜨리는 설정은 거부하고, 맞는 값은 받는다
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"templateCode\":\"dio-remote-portrait\",\"remoteTemplate\":\"Bad Id\"}}"))
			.andExpect(status().isBadRequest());
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"templateCode\":\"dio-remote-portrait\",\"templateVersion\":\"1.0.0\",\"remoteTemplate\":\"autumn\"}}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.page.templateConfig.remoteTemplate").value("autumn"));
		// templateId 없는 원격 페이지(앱이 만든 방식)는 저장된 설정의 templateCode 로 원격임을 안다.
		// 설정을 통째로 바꾸는 PATCH(속지 글꼴 변경 등)가 templateCode 를 빼도 이어받고, remoteTemplate 만 바꾸면 그 값을 쓴다
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"remoteTemplate\":\"winter\",\"paperAppearance\":{\"font\":\"maruburi\"}}}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.page.templateConfig.remoteTemplate").value("winter"))
			.andExpect(jsonPath("$.page.templateConfig.templateCode").value("dio-remote-portrait"))
			.andExpect(jsonPath("$.page.templateConfig.templateVersion").value("1.0.0"));
		// templateCode 와 remoteTemplate 을 둘 다 빼도 속지 정체는 이어받아 지워지지 않는다(공유 구성원 앱이 계속 속지를 찾는다)
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"paperAppearance\":{\"font\":\"gowun-batang\"}}}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.page.templateConfig.remoteTemplate").value("winter"))
			.andExpect(jsonPath("$.page.templateConfig.templateCode").value("dio-remote-portrait"))
			.andExpect(jsonPath("$.page.templateConfig.paperAppearance.font").value("gowun-batang"));
		// 적은 값이 틀렸으면(이어받기와 상관없이) 거부한다
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"remoteTemplate\":null}}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PAGE_REQUEST"));
		// 설정만 바꾸면서 일반 속지 코드로 바꾸는 것도 거부한다(속지 변경은 templateId 로)
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"templateCode\":\"2026-cover-portrait\",\"remoteTemplate\":\"winter\"}}"))
			.andExpect(status().isBadRequest());
		// 원격 속지끼리라도 설정만으로 방향 행을 바꾸면 거부한다(캔버스 크기와 어긋난다)
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"templateCode\":\"dio-remote-landscape\",\"templateVersion\":\"1.0.0\",\"remoteTemplate\":\"winter\"}}"))
			.andExpect(status().isBadRequest());
		// 일반 페이지를 설정만으로 원격 속지로 바꾸는 것도 거부한다
		String plainId=createPage(diaryId,"{\"templateConfig\":{\"templateCode\":\"2026-cover-portrait\",\"templateVersion\":\"1.0.0\"}}");
		mvc.perform(patch("/api/v1/pages/"+plainId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"templateCode\":\"dio-remote-portrait\",\"remoteTemplate\":\"winter\"}}"))
			.andExpect(status().isBadRequest());
		// 일반 속지 페이지는 이어받지 않는다. 설정을 통째로 바꾸며 templateCode 를 빼면(빈 종이로 바꾸기) 그대로 저장된다
		mvc.perform(patch("/api/v1/pages/"+plainId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"blank\":true}}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.page.templateConfig.blank").value(true))
			.andExpect(jsonPath("$.page.templateConfig.templateCode").doesNotExist())
			.andExpect(jsonPath("$.page.templateConfig.templateVersion").doesNotExist());
		// 마지막으로 저장된 값은 그대로다
		mvc.perform(get("/api/v1/pages/"+pageId).with(authenticated()))
			.andExpect(status().isOk()).andExpect(jsonPath("$.page.templateConfig.remoteTemplate").value("winter"));
		// 원격 페이지의 방향은 templateId 로 바꾼다. 설정을 생략하면 remoteTemplate 을 이어받고 캔버스도 그 행 크기가 된다
		mvc.perform(patch("/api/v1/pages/"+pageId).with(authenticated()).contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":"+remote.getTemplateId()+"}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.page.templateConfig.remoteTemplate").value("winter"))
			.andExpect(jsonPath("$.page.canvasWidth").value(1024.00));
		// 일반 페이지를 원격 행으로 바꿀 때는 어떤 속지인지 알 수 없으므로 remoteTemplate 이 꼭 있어야 한다
		mvc.perform(patch("/api/v1/pages/"+plainId).with(authenticated()).contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":"+remote.getTemplateId()+"}"))
			.andExpect(status().isBadRequest());
		// 일반 페이지 설정은 그대로 받는다
		String blankId=createPage(diaryId,"{\"templateConfig\":{\"paperColor\":\"#FFFFFF\"}}");
		// 속지 코드가 없는 페이지(빈 종이)도 설정만으로 원격 속지로 바꿀 수 없다(일반 속지 페이지와 같은 규칙)
		mvc.perform(patch("/api/v1/pages/"+blankId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"templateConfig\":{\"templateCode\":\"dio-remote-portrait\",\"templateVersion\":\"1.0.0\",\"remoteTemplate\":\"winter\"}}"))
			.andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/pages/"+blankId).with(authenticated()))
			.andExpect(status().isOk()).andExpect(jsonPath("$.page.templateConfig.templateCode").doesNotExist());
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
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("MEDIA_FILE_NOT_FOUND"));
		mvc.perform(patch("/api/v1/pages/"+pageId+"/elements/"+elementId).with(authenticated()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"version\":1,\"mediaFileId\":\""+UUID.randomUUID()+"\"}"))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("MEDIA_FILE_NOT_FOUND"));
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

	/** code · 1.0.0 행(같은 H2 를 쓰는 다른 테스트가 이미 만들었으면 그 행). 서버는 같은 코드 · 버전 행이 둘이면 거부하므로 겹치게 만들지 않는다 */
	private PageTemplate versionedTemplate(String code,BigDecimal width,BigDecimal height,String defaultConfig,boolean active) throws Exception {
		var existing=pageTemplateRepository.findAll().stream().filter(row->code.equals(row.getCode())&&"1.0.0".equals(row.getTemplateVersion())).findFirst();
		if(existing.isPresent())return existing.get();
		PageTemplate template=activeTemplate(code,width,height,defaultConfig);
		setField(template,"templateVersion","1.0.0"); setField(template,"isActive",active);
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
