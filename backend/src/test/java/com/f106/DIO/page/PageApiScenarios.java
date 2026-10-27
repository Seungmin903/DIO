package com.f106.DIO.page;

import java.util.List;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 페이지·캔버스 요소 API 흐름. H2와 PostgreSQL 하위 클래스가 같은 시나리오를 실행한다. */
abstract class PageApiScenarios {

	@Autowired MockMvc mvc;
	@Autowired DiaryRepository diaries;

	private UUID diaryId() {
		return diaries.saveAndFlush(new Diary("PAGE_API_TEST", "#D6BFA7", "PLAIN", "PRIVATE")).getDiaryId();
	}

	private String createPage(UUID diaryId, String body) throws Exception {
		String response = mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages").contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString();
		return JsonPath.read(response, "$.page.pageId");
	}

	private String batch(String pageId, String body) throws Exception {
		return mvc.perform(post("/api/v1/pages/" + pageId + "/elements/batch").contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
	}

	@Test
	void createsListsUpdatesAndDeletesPages() throws Exception {
		UUID diaryId = diaryId();
		String first = createPage(diaryId, "{\"title\":\"  첫 장  \",\"templateConfig\":{\"lineGap\":24}}");
		String second = createPage(diaryId, "{}");

		mvc.perform(get("/api/v1/diaries/" + diaryId + "/pages"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(2)))
			.andExpect(jsonPath("$.items[0].pageId").value(first))
			.andExpect(jsonPath("$.items[0].title").value("첫 장"))
			.andExpect(jsonPath("$.items[0].templateConfig.lineGap").value(24))
			.andExpect(jsonPath("$.items[0].canvasWidth").value(1280.00))
			.andExpect(jsonPath("$.items[1].sortKey").value(2));

		mvc.perform(patch("/api/v1/pages/" + second).contentType(MediaType.APPLICATION_JSON)
			.content("{\"gridVisible\":true,\"gridColor\":\"#AABBCC\",\"canvasWidth\":800,\"canvasHeight\":1280}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.page.gridVisible").value(true))
			.andExpect(jsonPath("$.page.gridColor").value("#AABBCC"))
			.andExpect(jsonPath("$.page.canvasHeight").value(1280));

		mvc.perform(delete("/api/v1/pages/" + first)).andExpect(status().isNoContent());
		mvc.perform(delete("/api/v1/pages/" + first)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("PAGE_NOT_FOUND"));
		mvc.perform(get("/api/v1/diaries/" + diaryId + "/pages"))
			.andExpect(jsonPath("$.items", hasSize(1)));
	}

	@Test
	void rejectsInvalidPageRequests() throws Exception {
		UUID diaryId = diaryId();
		String pageId = createPage(diaryId, "{}");

		mvc.perform(post("/api/v1/diaries/" + UUID.randomUUID() + "/pages").contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
		mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages").contentType(MediaType.APPLICATION_JSON).content("{\"canvasWidth\":100}"))
			.andExpect(status().isBadRequest());
		mvc.perform(post("/api/v1/diaries/" + diaryId + "/pages").contentType(MediaType.APPLICATION_JSON).content("{\"templateId\":999999}"))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("PAGE_TEMPLATE_NOT_FOUND"));
		mvc.perform(patch("/api/v1/pages/" + pageId).contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isBadRequest());
		mvc.perform(patch("/api/v1/pages/" + pageId).contentType(MediaType.APPLICATION_JSON).content("{\"title\":null}"))
			.andExpect(status().isBadRequest());
		mvc.perform(patch("/api/v1/pages/" + pageId).contentType(MediaType.APPLICATION_JSON).content("{\"diaryId\":\"x\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/pages/not-a-uuid")).andExpect(status().isBadRequest());
	}

	@Test
	void reordersPagesWithTheFullPageList() throws Exception {
		UUID diaryId = diaryId();
		String a = createPage(diaryId, "{}");
		String b = createPage(diaryId, "{}");
		String c = createPage(diaryId, "{}");

		mvc.perform(put("/api/v1/diaries/" + diaryId + "/pages/order").contentType(MediaType.APPLICATION_JSON)
			.content("{\"pageIds\":[\"" + c + "\",\"" + a + "\",\"" + b + "\"]}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].pageId").value(c))
			.andExpect(jsonPath("$.items[1].pageId").value(a))
			.andExpect(jsonPath("$.items[2].pageId").value(b));

		mvc.perform(put("/api/v1/diaries/" + diaryId + "/pages/order").contentType(MediaType.APPLICATION_JSON)
			.content("{\"pageIds\":[\"" + c + "\",\"" + a + "\"]}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		mvc.perform(put("/api/v1/diaries/" + diaryId + "/pages/order").contentType(MediaType.APPLICATION_JSON)
			.content("{\"pageIds\":[\"" + c + "\",\"" + a + "\",\"" + a + "\"]}"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void appliesElementBatchAndReturnsElementsInDetail() throws Exception {
		UUID diaryId = diaryId();
		String pageId = createPage(diaryId, "{}");
		String textId = UUID.randomUUID().toString();
		String stickerId = UUID.randomUUID().toString();

		String created = batch(pageId, """
			{"creates":[
			  {"elementId":"%s","type":"text","x":10,"y":20,"w":100,"h":40,"propertiesJson":{"text":"안녕","fontSize":18}},
			  {"elementId":"%s","elementType":"STICKER","x":0,"y":0,"width":64,"height":64,"locked":true}
			]}
			""".formatted(textId, stickerId));
		assertThat(JsonPath.<List<String>>read(created, "$.items[*].elementId")).containsExactly(textId, stickerId);

		mvc.perform(get("/api/v1/pages/" + pageId))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.page.pageId").value(pageId))
			.andExpect(jsonPath("$.elements", hasSize(2)))
			.andExpect(jsonPath("$.elements[0].elementType").value("TEXT"))
			.andExpect(jsonPath("$.elements[0].propertiesJson.text").value("안녕"))
			.andExpect(jsonPath("$.elements[0].opacity").value(1))
			.andExpect(jsonPath("$.elements[0].sortKey").value(1))
			.andExpect(jsonPath("$.elements[1].isLocked").value(true))
			.andExpect(jsonPath("$.elements[1].sortKey").value(2));

		String changed = batch(pageId, """
			{"updates":[{"elementId":"%s","x":30,"sortKey":5}],"deleteElementIds":["%s"]}
			""".formatted(textId, stickerId));
		assertThat(JsonPath.<List<String>>read(changed, "$.items[*].elementId")).containsExactly(textId);
		assertThat(JsonPath.<Number>read(changed, "$.items[0].x").doubleValue()).isEqualTo(30.0);

		String restored = batch(pageId, "{\"restoreElementIds\":[\"" + stickerId + "\"]}");
		assertThat(JsonPath.<List<String>>read(restored, "$.items[*].elementId")).containsExactly(stickerId, textId);
	}

	@Test
	void rejectsInvalidBatches() throws Exception {
		UUID diaryId = diaryId();
		String pageId = createPage(diaryId, "{}");
		String newId = UUID.randomUUID().toString();

		mvc.perform(post("/api/v1/pages/" + pageId + "/elements/batch").contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isBadRequest());
		mvc.perform(post("/api/v1/pages/" + pageId + "/elements/batch").contentType(MediaType.APPLICATION_JSON).content("""
			{"creates":[{"type":"VIDEO","x":0,"y":0,"w":1,"h":1}]}
			""")).andExpect(status().isBadRequest());
		mvc.perform(post("/api/v1/pages/" + pageId + "/elements/batch").contentType(MediaType.APPLICATION_JSON).content("""
			{"updates":[{"elementId":"%1$s","x":1}],"deleteElementIds":["%1$s"]}
			""".formatted(newId))).andExpect(status().isBadRequest());
	}

	@Test
	void updatesDeletesAndRestoresASingleElement() throws Exception {
		UUID diaryId = diaryId();
		String pageId = createPage(diaryId, "{}");
		String elementId = UUID.randomUUID().toString();
		batch(pageId, "{\"creates\":[{\"elementId\":\"" + elementId + "\",\"type\":\"PHOTO\",\"x\":0,\"y\":0,\"w\":10,\"h\":10}]}");
		String elementUrl = "/api/v1/pages/" + pageId + "/elements/" + elementId;

		mvc.perform(patch(elementUrl).contentType(MediaType.APPLICATION_JSON).content("{\"rotation\":15.5,\"opacity\":0.5,\"hidden\":true}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.element.rotation").value(15.5))
			.andExpect(jsonPath("$.element.opacity").value(0.5))
			.andExpect(jsonPath("$.element.isHidden").value(true));
		mvc.perform(patch(elementUrl).contentType(MediaType.APPLICATION_JSON).content("{\"opacity\":2}"))
			.andExpect(status().isBadRequest());
		mvc.perform(patch(elementUrl).contentType(MediaType.APPLICATION_JSON).content("{\"pageId\":\"" + pageId + "\"}"))
			.andExpect(status().isBadRequest());

		mvc.perform(post(elementUrl + "/restore")).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("ELEMENT_NOT_DELETED"));
		mvc.perform(delete(elementUrl)).andExpect(status().isNoContent());
		mvc.perform(patch(elementUrl).contentType(MediaType.APPLICATION_JSON).content("{\"x\":1}"))
			.andExpect(status().isNotFound());
		mvc.perform(post(elementUrl + "/restore")).andExpect(status().isOk())
			.andExpect(jsonPath("$.element.elementId").value(elementId))
			.andExpect(jsonPath("$.element.rotation").value(15.5));

		String otherPage = createPage(diaryId, "{}");
		mvc.perform(delete("/api/v1/pages/" + otherPage + "/elements/" + elementId)).andExpect(status().isNotFound());
		mvc.perform(post("/api/v1/pages/" + otherPage + "/elements/batch").contentType(MediaType.APPLICATION_JSON)
			.content("{\"creates\":[{\"elementId\":\"" + elementId + "\",\"type\":\"TEXT\",\"x\":0,\"y\":0,\"w\":1,\"h\":1}]}"))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ELEMENT_ALREADY_EXISTS"));
	}

	@Test
	void copiesPageWithLiveElementsOnly() throws Exception {
		UUID diaryId = diaryId();
		String pageId = createPage(diaryId, "{\"title\":\"원본\",\"templateConfig\":{\"paper\":\"dot\"}}");
		String kept = UUID.randomUUID().toString();
		String removed = UUID.randomUUID().toString();
		batch(pageId, """
			{"creates":[
			  {"elementId":"%s","type":"TEXT","x":1,"y":2,"w":3,"h":4,"propertiesJson":{"text":"복사"}},
			  {"elementId":"%s","type":"TAPE","x":0,"y":0,"w":1,"h":1}
			]}
			""".formatted(kept, removed));
		mvc.perform(delete("/api/v1/pages/" + pageId + "/elements/" + removed)).andExpect(status().isNoContent());

		String response = mvc.perform(post("/api/v1/pages/" + pageId + "/copy"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.page.title").value("원본"))
			.andExpect(jsonPath("$.page.templateConfig.paper").value("dot"))
			.andExpect(jsonPath("$.page.sortKey").value(2))
			.andReturn().getResponse().getContentAsString();
		String copyId = JsonPath.read(response, "$.page.pageId");
		assertThat(copyId).isNotEqualTo(pageId);

		mvc.perform(get("/api/v1/pages/" + copyId))
			.andExpect(jsonPath("$.elements", hasSize(1)))
			.andExpect(jsonPath("$.elements[0].elementId").value(not(kept)))
			.andExpect(jsonPath("$.elements[0].pageId").value(copyId))
			.andExpect(jsonPath("$.elements[0].propertiesJson.text").value("복사"));
		mvc.perform(get("/api/v1/pages/" + pageId)).andExpect(jsonPath("$.elements", hasSize(1)));
	}
}
