package com.f106.DIO.diary.http;

import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.repository.RefreshTokenHistoryRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.support.LoginSecrets;


import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.f106.DIO.diary.creation.MemberDiaryCreationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:member-http;MODE=PostgreSQL"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class MemberDiaryHttpTests {
    static final String PATH="/api/v1/member/diaries";
    @DynamicPropertySource static void jwtKey(DynamicPropertyRegistry registry) {
        byte[] bytes = new byte[32];
        new java.security.SecureRandom().nextBytes(bytes);
        String key = java.util.Base64.getEncoder().encodeToString(bytes);
        registry.add("dio.auth.jwt-secret", () -> key);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired LoginJwt jwt;
    @Autowired RefreshTokenRepository sessions;
    @Autowired RefreshTokenHistoryRepository history;
    @MockitoSpyBean MemberDiaryCreationService creation;
    String owner,other,lastKey;
    RefreshToken ownerSession;

    @BeforeEach void fixtures() {
        jdbc.execute("create table if not exists page_templates(template_id bigint primary key,code varchar(100),template_version varchar(30),orientation varchar(20),canvas_width decimal(10,2),canvas_height decimal(10,2),default_config jsonb,is_active boolean default true)");
        jdbc.execute("create table if not exists pages(page_id uuid primary key,diary_id uuid,template_id bigint,template_config jsonb,sort_key decimal(20,10),canvas_width decimal(10,2),canvas_height decimal(10,2),created_at timestamp(6) with time zone,updated_at timestamp(6) with time zone,deleted_at timestamp(6) with time zone)");
        jdbc.execute("create table if not exists diary_members(diary_id uuid,user_id bigint,role varchar(20),member_color char(7),joined_at timestamp(6) with time zone,left_at timestamp(6) with time zone,primary key(diary_id,user_id))");
        jdbc.execute("create table if not exists diary_creation_receipts(user_id bigint,key_hash char(64),request_hash char(64),diary_id uuid,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
        jdbc.update("delete from diary_creation_receipts");
        jdbc.update("delete from pages"); jdbc.update("delete from diary_members"); jdbc.update("delete from diaries");
        jdbc.update("delete from page_templates"); history.deleteAll(); sessions.deleteAll(); jdbc.update("delete from users");
        for(long id:new long[]{101,202}) jdbc.update("insert into users(user_id,nickname,nickname_key,profile_color,status,created_at,updated_at) values(?,?,?,'#123456','ACTIVE',?,?)",
            id,"user"+id,"user"+id,Timestamp.from(Instant.now()),Timestamp.from(Instant.now()));
        jdbc.update("insert into page_templates(template_id,code,template_version,orientation,canvas_width,canvas_height) values(10,'2026-cover-landscape','1.0.0','LANDSCAPE',1024,768)");
        ownerSession=session(101); owner=access(101,ownerSession);
        other=access(202,session(202));
    }
    RefreshToken session(long id) { return sessions.saveAndFlush(new RefreshToken(id,LoginSecrets.hash(UUID.randomUUID().toString()),"test",Instant.now(),Instant.now().plusSeconds(600))); }
    String access(long id,RefreshToken session) { return jwt.issue(id,session.getSessionId(),Instant.now(),Instant.now().plusSeconds(300)); }
    String body(int count) {
        return json.writeValueAsString(Map.of("diaryTitle","  member  ","coverColor","#123456","coverStyle","PLAIN",
            "initialPages",java.util.Collections.nCopies(count,Map.of("templateCode","2026-cover-landscape","templateVersion","1.0.0","templateConfig",Map.of("width",1024,"height",768)))));
    }
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder memberPost() {
        lastKey="http-key-"+UUID.randomUUID();
        return post(PATH).header("Idempotency-Key",lastKey);
    }
    JsonNode create() throws Exception {
        var result=mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(body(2)))
            .andExpect(status().isCreated()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.diary.canEdit").value(true))
            .andReturn();
        var node=json.readTree(result.getResponse().getContentAsByteArray());
        assertThat(result.getResponse().getHeader("Location")).isEqualTo(PATH+"/"+node.get("diary").get("diaryId").asString());
        assertThat(node.get("pageIds").size()).isEqualTo(2);
        assertThat(node.get("firstPageId").asString()).isEqualTo(node.get("pageIds").get(0).asString());
        return node;
    }
    String id(JsonNode created) { return created.get("diary").get("diaryId").asString(); }
    String patchBody(JsonNode created,String title) { return json.writeValueAsString(Map.of("diaryTitle",title,"expectedUpdatedAt",created.get("diary").get("updatedAt").asString())); }
    void noneCreated() {
        for(var table:List.of("diaries","diary_members","pages","diary_creation_receipts")) assertThat(jdbc.queryForObject("select count(*) from "+table,Long.class)).isZero();
    }

    @Test void createsReadsUpdatesAndRejectsStaleUpdatesThroughTheActualSecurityChain() throws Exception {
        var created=create(); String id=id(created);
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andExpect(jsonPath("$.diary.diaryTitle").value("member"));
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(patchBody(created,"renamed")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.diary.diaryTitle").value("renamed"));
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(patchBody(created,"stale")))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIARY_METADATA_CONFLICT"));
        assertThat(jdbc.queryForObject("select owner_user_id from diaries",Long.class)).isEqualTo(101);
        assertThat(jdbc.queryForObject("select title from diaries",String.class)).isEqualTo("renamed");
    }

    @Test void absentExpiredInvalidAndLoggedOutTokensFailBeforeJsonValidation() throws Exception {
        for(String token:List.of("", "not.a.jwt",jwt.issue(101L,ownerSession.getSessionId(),Instant.now().minusSeconds(60),Instant.now().minusSeconds(1)))) {
            var request=post(PATH).contentType(MediaType.APPLICATION_JSON).content("not-json");
            if(!token.isEmpty()) request.header("Authorization","Bearer "+token);
            mvc.perform(request).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_TOKEN"))
                .andExpect(header().string("WWW-Authenticate","Bearer")).andExpect(header().string("Cache-Control","no-store"));
        }
        ownerSession.revoke(Instant.now()); sessions.saveAndFlush(ownerSession);
        mvc.perform(get(PATH+"/"+UUID.randomUUID()).header("Authorization","Bearer "+owner)).andExpect(status().isUnauthorized());
        noneCreated();
    }

    @Test void validatesUnknownNullMalformedAndUnsupportedInputsWithoutSavingAnything() throws Exception {
        var unknown=json.readTree(body(1)); ((tools.jackson.databind.node.ObjectNode)unknown).put("ownerUserId",202);
        for(String body:List.of("{}","not-json",unknown.toString(),body(1).replace("2026-cover-landscape","missing"),body(1).replace("1.0.0","old"),body(513))) {
            mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)).andExpect(jsonPath("$.code").isString());
            noneCreated();
        }
        var node=(tools.jackson.databind.node.ObjectNode)json.readTree(body(1));
        ((tools.jackson.databind.node.ObjectNode)node.get("initialPages").get(0)).putNull("templateConfig");
        mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(node.toString())).andExpect(status().isBadRequest());
        noneCreated();
        mvc.perform(memberPost().header("Authorization","Bearer "+owner).header("Idempotency-Key","bad key").contentType(MediaType.APPLICATION_JSON).content(body(1)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_IDEMPOTENCY_KEY"));
        noneCreated();
    }

    @Test void patchRequiresMetadataAndAnExactNonNullTimestampAndRejectsUnknownFields() throws Exception {
        var created=create(); String id=id(created),stamp=created.get("diary").get("updatedAt").asString();
        for(String body:List.of("{}","{\"diaryTitle\":\"x\"}","{\"expectedUpdatedAt\":null,\"diaryTitle\":\"x\"}",
            "{\"expectedUpdatedAt\":\""+stamp+"\",\"diaryTitle\":null}","{\"expectedUpdatedAt\":\""+stamp+"\",\"visibility\":\"LINK\"}",
            "{\"expectedUpdatedAt\":\""+stamp+"\"}","{\"expectedUpdatedAt\":\"invalid\",\"diaryTitle\":\"x\"}")) {
            mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        mvc.perform(get(PATH+"/invalid").header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_MEMBER_DIARY_REQUEST"));
        assertThat(jdbc.queryForObject("select title from diaries",String.class)).isEqualTo("member");
    }

    @Test void nonMembersDeletedAndLeftMembershipsAre404AndViewersCannotEdit() throws Exception {
        var created=create(); String id=id(created);
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'VIEWER','#654321')",UUID.fromString(id));
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isOk()).andExpect(jsonPath("$.diary.canEdit").value(false));
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+other).contentType(MediaType.APPLICATION_JSON).content(patchBody(created,"forbidden")))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIARY_METADATA_FORBIDDEN"));
        jdbc.update("update diary_members set left_at=? where user_id=202",Timestamp.from(Instant.now()));
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        jdbc.update("update diaries set deleted_at=?",Timestamp.from(Instant.now()));
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNotFound());
    }

    @Test void publicLegacyRoutesCannotReadModifyDeleteOrListMemberDiaries() throws Exception {
        var created=create(); String path="/api/v1/diaries/"+id(created);
        mvc.perform(get(path)).andExpect(status().isNotFound());
        mvc.perform(patch(path).contentType(MediaType.APPLICATION_JSON).content("{\"diaryTitle\":\"attack\"}")).andExpect(status().isNotFound());
        mvc.perform(delete(path)).andExpect(status().isNotFound());
        var list=mvc.perform(get("/api/v1/diaries")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(list).doesNotContain(id(created));
        assertThat(jdbc.queryForObject("select title from diaries",String.class)).isEqualTo("member");
        assertThat(jdbc.queryForObject("select count(*) from diaries where deleted_at is null",Long.class)).isEqualTo(1);
    }

    @Test void realSecondPageFailureRollsBackAllRowsAndDoesNotExposeSql() throws Exception {
        jdbc.execute("alter table pages add constraint qa_http_failure check(sort_key<2)");
        try {
            var response=mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(body(2)))
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.code").value("DIARY_PERSISTENCE_FAILED")).andReturn().getResponse().getContentAsString();
            assertThat(response).doesNotContain("insert into","qa_http_failure",owner); noneCreated();
        } finally { jdbc.execute("alter table pages drop constraint qa_http_failure"); }
    }

    @Test void storageUnavailabilityIs503WithoutLeakingInfrastructureDetails() throws Exception {
        doThrow(new org.springframework.jdbc.CannotGetJdbcConnectionException("sensitive database url"))
            .when(creation).create(any(),anyList());
        var response=mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(body(1)))
            .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("DIARY_PERSISTENCE_UNAVAILABLE")).andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("sensitive database url"); noneCreated();
    }

    @Test void corsAndOpenApiDescribeTheActualMemberRoutesAndErrorSchema() throws Exception {
        mvc.perform(options(PATH).header("Origin","http://localhost:8081").header("Access-Control-Request-Method","POST")
            .header("Access-Control-Request-Headers","authorization,content-type")).andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:8081"));
        var doc=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
        assertThat(doc.get("paths").get(PATH).get("post").get("responses").has("201")).isTrue();
        assertThat(doc.get("paths").get(PATH+"/{diaryId}").get("patch").get("responses").has("409")).isTrue();
        assertThat(doc.get("paths").get(PATH).get("post").get("security").toString()).contains("bearerAuth");
        assertThat(doc.get("components").get("schemas").get("MemberDiaryProblem").get("required").toString()).contains("status","title","code","detail");
    }

    @Test void exportsActualSpringResponsesForTheFrontendContractTest() throws Exception {
        var created=create(); String id=id(created);
        var result=new java.util.LinkedHashMap<String,Object>();
        result.put("idempotencyKey",lastKey); result.put("created",created); result.put("createRequest",json.readTree(body(2)));
        var replay=mvc.perform(post(PATH).header("Idempotency-Key",result.get("idempotencyKey")).header("Authorization","Bearer "+owner)
            .contentType(MediaType.APPLICATION_JSON).content(body(2))).andExpect(status().isCreated()).andExpect(header().string("Idempotency-Replayed","true")).andReturn().getResponse();
        result.put("replayed",json.readTree(replay.getContentAsByteArray()));
        result.put("idempotencyConflict",json.readTree(mvc.perform(post(PATH).header("Idempotency-Key",result.get("idempotencyKey")).header("Authorization","Bearer "+owner)
            .contentType(MediaType.APPLICATION_JSON).content(body(2).replace("member","different"))).andExpect(status().isConflict()).andReturn().getResponse().getContentAsByteArray()));
        result.put("detail",json.readTree(mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()));
        String patch=patchBody(created,"renamed"); result.put("updateRequest",json.readTree(patch));
        result.put("updated",json.readTree(mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(patch)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()));
        result.put("conflict",json.readTree(mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(patch)).andExpect(status().isConflict()).andReturn().getResponse().getContentAsByteArray()));
        result.put("unauthorized",json.readTree(mvc.perform(get(PATH+"/"+id)).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsByteArray()));
        result.put("missing",json.readTree(mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsByteArray()));
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'VIEWER','#654321')",UUID.fromString(id));
        result.put("forbidden",json.readTree(mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+other).contentType(MediaType.APPLICATION_JSON).content(patch)).andExpect(status().isForbidden()).andReturn().getResponse().getContentAsByteArray()));
        result.put("invalid",json.readTree(mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsByteArray()));
        result.put("openapi",json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()));
        var output=java.nio.file.Path.of("build","contracts","member-diary-http.json");
        java.nio.file.Files.createDirectories(output.getParent());
        java.nio.file.Files.writeString(output,json.writeValueAsString(result),java.nio.charset.StandardCharsets.UTF_8);
    }

    @Test void sameHttpKeyReplaysTheSameResponseAndDifferentContentsAre409() throws Exception {
        String key="same-http-key";
        var first=mvc.perform(post(PATH).header("Idempotency-Key",key).header("Authorization","Bearer "+owner)
            .contentType(MediaType.APPLICATION_JSON).content(body(2))).andExpect(status().isCreated())
            .andExpect(header().string("Idempotency-Replayed","false")).andReturn().getResponse();
        var replay=mvc.perform(post(PATH).header("Idempotency-Key",key).header("Authorization","Bearer "+owner)
            .contentType(MediaType.APPLICATION_JSON).content(body(2))).andExpect(status().isCreated())
            .andExpect(header().string("Idempotency-Replayed","true")).andReturn().getResponse();
        assertThat(replay.getContentAsString()).isEqualTo(first.getContentAsString());
        assertThat(replay.getHeader("Location")).isEqualTo(first.getHeader("Location"));
        mvc.perform(post(PATH).header("Idempotency-Key",key).header("Authorization","Bearer "+owner)
            .contentType(MediaType.APPLICATION_JSON).content(body(2).replace("member","changed")))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts",Long.class)).isEqualTo(1);
    }

    @Test void httpRequiresAKeyAndTheSameKeyForAnotherUserCreatesAnIndependentDiary() throws Exception {
        mvc.perform(post(PATH).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(body(1)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MISSING_IDEMPOTENCY_KEY"));
        noneCreated();
        for(String token:List.of(owner,other)) {
            mvc.perform(post(PATH).header("Idempotency-Key","cross-user-key").header("Authorization","Bearer "+token)
                .contentType(MediaType.APPLICATION_JSON).content(body(1))).andExpect(status().isCreated());
        }
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(2);
        ownerSession.revoke(Instant.now()); sessions.saveAndFlush(ownerSession);
        mvc.perform(post(PATH).header("Idempotency-Key","cross-user-key").header("Authorization","Bearer "+owner)
            .contentType(MediaType.APPLICATION_JSON).content(body(1))).andExpect(status().isUnauthorized());
    }

    @Test void memberListScopesBeforePaginationAndIncludesSharedReadOnlyMetadata() throws Exception {
        var owned=create();
        var remote=json.readTree(mvc.perform(memberPost().header("Authorization","Bearer "+other).contentType(MediaType.APPLICATION_JSON).content(body(1)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsByteArray());
        mvc.perform(get(PATH).header("Authorization","Bearer "+owner)).andExpect(status().isOk())
            .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].diary.diaryId").value(id(owned)))
            .andExpect(jsonPath("$.items[0].pageCount").value(2)).andExpect(jsonPath("$.hasNext").value(false));
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,101,'VIEWER','#123456')",UUID.fromString(id(remote)));
        mvc.perform(get(PATH).param("q","member").param("sort","title").header("Authorization","Bearer "+owner))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(2));
        String listed=mvc.perform(get(PATH).header("Authorization","Bearer "+owner)).andReturn().getResponse().getContentAsString();
        var items=json.readTree(listed).get("items"); boolean checked=false;
        for(var item:items) if(item.get("diary").get("diaryId").asString().equals(id(remote))) {
            assertThat(item.get("diary").get("canEdit").asBoolean()).isFalse();assertThat(item.get("shared").asBoolean()).isTrue();checked=true;
        }
        assertThat(checked).isTrue();
        jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=101",UUID.fromString(id(remote)));
        jdbc.update("update diaries set deleted_at=current_timestamp where diary_id=?",UUID.fromString(id(owned)));
        mvc.perform(get(PATH).header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
    }

    @Test void memberListCursorIsBoundToAccountQueryAndSortAndEscapesWildcards() throws Exception {
        var first=create();var second=create();
        jdbc.update("update diaries set title='literal%_title' where diary_id=?",UUID.fromString(id(first)));
        mvc.perform(get(PATH).param("q","%_").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1));
        for(String sort:List.of("created","updated","title","pages")) {
            var page=json.readTree(mvc.perform(get(PATH).param("limit","1").param("sort",sort).header("Authorization","Bearer "+owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasNext").value(true)).andReturn().getResponse().getContentAsByteArray());
            String cursor=page.get("nextCursor").asString();
            var next=json.readTree(mvc.perform(get(PATH).param("limit","1").param("sort",sort).param("cursor",cursor).header("Authorization","Bearer "+owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasNext").value(false)).andReturn().getResponse().getContentAsByteArray());
            assertThat(next.get("items").get(0).get("diary").get("diaryId").asString()).isNotEqualTo(page.get("items").get(0).get("diary").get("diaryId").asString());
            mvc.perform(get(PATH).param("sort",sort).param("cursor",cursor).header("Authorization","Bearer "+other)).andExpect(status().isBadRequest());
            mvc.perform(get(PATH).param("sort",sort).param("q","different").param("cursor",cursor).header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        }
        for(String limit:List.of("0","101","bad")) mvc.perform(get(PATH).param("limit",limit).header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        mvc.perform(get(PATH).param("cursor","invalid").header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        mvc.perform(get(PATH).param("sort","unsafe").header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
    }

    @Test void inProgressErrorsExposeRetryAfterAndRollBackTheAttempt() throws Exception {
        doThrow(new com.f106.DIO.diary.creation.DiaryIdempotencyException(org.springframework.http.HttpStatus.CONFLICT,"IDEMPOTENCY_IN_PROGRESS","retry same key"))
            .when(creation).create(any(),anyList());
        mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(body(1)))
            .andExpect(status().isConflict()).andExpect(header().string("Retry-After","1")).andExpect(jsonPath("$.code").value("IDEMPOTENCY_IN_PROGRESS"));
        noneCreated();
    }
}
