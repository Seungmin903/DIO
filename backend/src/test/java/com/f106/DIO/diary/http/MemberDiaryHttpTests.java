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
    @Autowired com.f106.DIO.media.repository.MediaFileRepository mediaFiles;
    @Autowired com.f106.DIO.media.service.MediaFileTransactionService mediaAccess;
    @MockitoSpyBean MemberDiaryCreationService creation;
    @MockitoSpyBean MemberDiaryListQuery lists;
    String owner,other,lastKey;
    RefreshToken ownerSession;

    @BeforeEach void fixtures() {
        jdbc.execute("create table if not exists page_templates(template_id bigint primary key,code varchar(100),template_version varchar(30),name varchar(100),category varchar(30),orientation varchar(20),canvas_width decimal(10,2),canvas_height decimal(10,2),default_config jsonb,is_active boolean default true)");
        jdbc.execute("create table if not exists pages(page_id uuid primary key,diary_id uuid,template_id bigint,template_config jsonb,sort_key decimal(20,10),canvas_width decimal(10,2),canvas_height decimal(10,2),created_at timestamp(6) with time zone,updated_at timestamp(6) with time zone,deleted_at timestamp(6) with time zone)");
        jdbc.execute("create table if not exists diary_members(diary_id uuid,user_id bigint,role varchar(20),is_favorite boolean not null default false,member_color char(7),joined_at timestamp(6) with time zone,left_at timestamp(6) with time zone,primary key(diary_id,user_id))");
        jdbc.execute("create table if not exists diary_creation_receipts(user_id bigint,key_hash char(64),request_hash char(64),diary_id uuid,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
        jdbc.update("delete from diary_creation_receipts");
        com.f106.DIO.diary.MemberH2Fixture.align(jdbc);
        jdbc.update("delete from pages"); jdbc.update("delete from diary_members"); jdbc.update("delete from diaries");
        jdbc.update("delete from page_templates"); history.deleteAll(); sessions.deleteAll(); jdbc.update("delete from users");
        for(long id:new long[]{101,202}) jdbc.update("insert into users(user_id,nickname,nickname_key,profile_color,status,created_at,updated_at) values(?,?,?,'#123456','ACTIVE',?,?)",
            id,"user"+id,"user"+id,Timestamp.from(Instant.now()),Timestamp.from(Instant.now()));
        jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height) values(10,'2026-cover-landscape','1.0.0','QA cover','COVER','LANDSCAPE',1024,768)");
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
    String patchBody(JsonNode created,String title) { return json.writeValueAsString(Map.of("diaryTitle",title,"expectedVersion",created.get("diary").get("version").asString())); }
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

    @Test void paperAppearanceSurvivesCreationReplayAndRespectsUpdateScope() throws Exception {
        var input=(tools.jackson.databind.node.ObjectNode)json.readTree(body(2));
        var appearance=input.putObject("paperAppearance").put("backgroundColor","#fff8e7").put("font","gowun-dodum");
        for(var page:input.get("initialPages"))
            ((tools.jackson.databind.node.ObjectNode)page.get("templateConfig")).set("paperAppearance",appearance);
        String payload=input.toString();
        var created=json.readTree(mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(payload))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.diary.paperAppearance.font").value("gowun-dodum"))
            .andReturn().getResponse().getContentAsByteArray());
        String diaryId=id(created);
        String pages="/api/v1/diaries/"+diaryId+"/pages";
        mvc.perform(post(PATH).header("Authorization","Bearer "+owner).header("Idempotency-Key",lastKey)
            .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isCreated())
            .andExpect(header().string("Idempotency-Replayed","true")).andExpect(jsonPath("$.diary.diaryId").value(diaryId));
        var next=Map.of("backgroundColor","#FFFFFF","layoutColor","#292929","font","nanum-pen");
        mvc.perform(patch(PATH+"/"+diaryId).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("expectedVersion","1","paperAppearance",next,"paperAppearanceScope","new"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.diary.paperAppearance.font").value("nanum-pen"));
        mvc.perform(get(pages).header("Authorization","Bearer "+owner)).andExpect(status().isOk())
            .andExpect(jsonPath("$.paperAppearance.font").value("nanum-pen"))
            .andExpect(jsonPath("$.items[0].templateConfig.paperAppearance.font").value("gowun-dodum"));
        mvc.perform(patch(PATH+"/"+diaryId).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("expectedVersion","2","paperAppearance",next,"paperAppearanceScope","all"))))
            .andExpect(status().isOk());
        mvc.perform(get(pages).header("Authorization","Bearer "+owner)).andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].templateConfig.paperAppearance.font").value("nanum-pen"))
            .andExpect(jsonPath("$.items[1].templateConfig.paperAppearance.font").value("nanum-pen"));
        mvc.perform(patch(PATH+"/"+diaryId).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON)
            .content("{\"expectedVersion\":\"3\",\"paperAppearance\":{\"font\":\"unknown\"},\"paperAppearanceScope\":\"all\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PAPER_APPEARANCE"));
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

    @Test void clientSuppliedDatabaseTemplateIdCannotOverrideTheCodeVersionMapping() throws Exception {
        var node=(tools.jackson.databind.node.ObjectNode)json.readTree(body(1));
        ((tools.jackson.databind.node.ObjectNode)node.get("initialPages").get(0)).put("templateId",987);
        mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(node.toString()))
            .andExpect(status().isBadRequest());
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
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'EDITOR','#654321')",UUID.fromString(id));
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isOk()).andExpect(jsonPath("$.diary.canEdit").value(false));
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+other).contentType(MediaType.APPLICATION_JSON).content(patchBody(created,"forbidden")))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIARY_METADATA_FORBIDDEN"));
        jdbc.update("update diary_members set left_at=? where user_id=202",Timestamp.from(Instant.now()));
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        jdbc.update("update diaries set deleted_at=?",Timestamp.from(Instant.now()));
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNotFound());
    }

    @Test void authenticatedLegacyReadsDoNotBypassMemberMetadataAndRetentionWrites() throws Exception {
        var created=create();String path="/api/v1/diaries/"+id(created);
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(patch(path).contentType(MediaType.APPLICATION_JSON).content("{\"diaryTitle\":\"attack\"}")).andExpect(status().isUnauthorized());
        mvc.perform(delete(path)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/diaries")).andExpect(status().isUnauthorized());
        mvc.perform(get(path).header("Authorization","Bearer "+owner)).andExpect(status().isOk());
        mvc.perform(get(path).header("Authorization","Bearer "+other)).andExpect(status().isForbidden());
        for(boolean expired:new boolean[]{false,true}) {
            if(expired)jdbc.update("update diary_creation_receipts set completed_at=?,response_body=null",Timestamp.from(Instant.now().minusSeconds(25*3600)));
            mvc.perform(patch(path).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content("{\"diaryTitle\":\"attack\"}")).andExpect(status().isNotFound());
            mvc.perform(delete(path).header("Authorization","Bearer "+owner)).andExpect(status().isNotFound());
        }
        assertThat(jdbc.queryForObject("select title from diaries",String.class)).isEqualTo("member");
        assertThat(jdbc.queryForObject("select count(*) from diaries where deleted_at is null and version=1",Long.class)).isEqualTo(1);
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

    @Test void unavailableSearchDoesNotBlockOtherMemberRoutesOrAuthentication() throws Exception {
        doThrow(new com.f106.DIO.diary.detail.DiaryDetailException(
            org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"DIARY_LIST_UNAVAILABLE",
            "회원 목록을 사용할 수 없어요. 잠시 후 다시 확인해 주세요."))
            .when(lists).list(eq("É"),any(),any(),any(),anyString(),anyBoolean());
        var unavailable=mvc.perform(get(PATH).param("q","É").header("Authorization","Bearer "+owner))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("DIARY_LIST_UNAVAILABLE"))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsString();
        assertThat(unavailable).doesNotContain("pg_collation","und-x-icu",owner);
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        mvc.perform(get(PATH).header("Authorization","Bearer "+owner)).andExpect(status().isOk());
        var created=mvc.perform(memberPost().header("Authorization","Bearer "+owner)
            .contentType(MediaType.APPLICATION_JSON).content(body(1)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        mvc.perform(get(PATH+"/"+id(json.readTree(created))).header("Authorization","Bearer "+owner)).andExpect(status().isOk());
    }

    @Test void memberPreflightAllowsCreateKeyAndPatchAndRejectsForeignOrigins() throws Exception {
        for (String method:List.of("POST","PATCH")) {
            String path=method.equals("POST")?PATH:PATH+"/"+UUID.randomUUID();
            mvc.perform(options(path).header("Origin","http://localhost:8081")
                .header("Access-Control-Request-Method",method)
                .header("Access-Control-Request-Headers","authorization,content-type,idempotency-key"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin","http://localhost:8081"))
                .andExpect(header().string("Access-Control-Allow-Methods",org.hamcrest.Matchers.containsString(method)))
                .andExpect(header().string("Access-Control-Allow-Headers",org.hamcrest.Matchers.containsString("idempotency-key")))
                .andExpect(header().string("Access-Control-Expose-Headers",org.hamcrest.Matchers.containsString("Idempotency-Replayed")));
            mvc.perform(options(path).header("Origin","https://untrusted.example")
                .header("Access-Control-Request-Method",method)).andExpect(status().isForbidden());
        }
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
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'EDITOR','#654321')",UUID.fromString(id));
        result.put("forbidden",json.readTree(mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+other).contentType(MediaType.APPLICATION_JSON).content(patch)).andExpect(status().isForbidden()).andReturn().getResponse().getContentAsByteArray()));
        result.put("invalid",json.readTree(mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsByteArray()));
        result.put("openapi",json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()));
        var output=java.nio.file.Path.of("build","contracts","member-diary-http.json");
        java.nio.file.Files.createDirectories(output.getParent());
        java.nio.file.Files.writeString(output,json.writeValueAsString(result),java.nio.charset.StandardCharsets.UTF_8);
    }

    @Test void omittedAndNullCoverMetadataUseDefaultsBeforePersistenceAndFingerprinting() throws Exception {
        var input=(tools.jackson.databind.node.ObjectNode)json.readTree(body(1));
        input.remove("coverColor");input.remove("coverStyle");
        String key="default-cover-"+UUID.randomUUID();
        var first=mvc.perform(post(PATH).header("Authorization","Bearer "+owner).header("Idempotency-Key",key)
            .contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isCreated())
            .andExpect(jsonPath("$.diary.coverColor").value("#CED9EE")).andExpect(jsonPath("$.diary.coverStyle").value("PLAIN"))
            .andReturn().getResponse().getContentAsString();
        var id=UUID.fromString(json.readTree(first).get("diary").get("diaryId").asString());
        assertThat(jdbc.queryForObject("select cover_color from diaries where diary_id=?",String.class,id)).isEqualTo("#CED9EE");
        assertThat(jdbc.queryForObject("select cover_style from diaries where diary_id=?",String.class,id)).isEqualTo("PLAIN");
        for(boolean explicitNull:new boolean[]{true,false}) {
            if(explicitNull) {input.putNull("coverColor");input.putNull("coverStyle");}
            else {input.put("coverColor","#CED9EE");input.put("coverStyle","PLAIN");}
            var replay=mvc.perform(post(PATH).header("Authorization","Bearer "+owner).header("Idempotency-Key",key)
                .contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isCreated())
                .andExpect(header().string("Idempotency-Replayed","true")).andReturn().getResponse().getContentAsString();
            assertThat(replay).isEqualTo(first);
        }
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
    }

    @Test void replayAfterPatchKeepsCreationSnapshotAndDetailProvidesCurrentVersion() throws Exception {
        var created=create();String key=lastKey,id=id(created);
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON)
            .content(patchBody(created,"latest title"))).andExpect(status().isOk()).andExpect(jsonPath("$.diary.version").value("2"));
        var replay=json.readTree(mvc.perform(post(PATH).header("Authorization","Bearer "+owner).header("Idempotency-Key",key)
            .contentType(MediaType.APPLICATION_JSON).content(body(2))).andExpect(status().isCreated())
            .andExpect(header().string("Idempotency-Replayed","true")).andReturn().getResponse().getContentAsByteArray());
        assertThat(replay).isEqualTo(created);
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON)
            .content(patchBody(replay,"stale title"))).andExpect(status().isConflict());
        var current=json.readTree(mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+owner))
            .andExpect(status().isOk()).andExpect(jsonPath("$.diary.diaryTitle").value("latest title"))
            .andExpect(jsonPath("$.diary.version").value("2")).andReturn().getResponse().getContentAsByteArray());
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON)
            .content(patchBody(current,"after refresh"))).andExpect(status().isOk()).andExpect(jsonPath("$.diary.version").value("3"));
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
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
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,101,'EDITOR','#123456')",UUID.fromString(id(remote)));
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

    @Test void unicodeWhitespaceCannotPoisonCreateOrPatchResponses() throws Exception {
        for(String blank:List.of("\u00a0","\u2007","\u202f","\ufeff","\u3000","\u2028","\u2029")) {
            var input=(tools.jackson.databind.node.ObjectNode)json.readTree(body(1));input.put("diaryTitle",blank);
            mvc.perform(memberPost().header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isBadRequest());
        }
        noneCreated();
        var created=create();
        for(String blank:List.of("\u00a0","\ufeff","\u202f"))
            mvc.perform(patch(PATH+"/"+id(created)).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(patchBody(created,blank))).andExpect(status().isBadRequest());
        mvc.perform(patch(PATH+"/"+id(created)).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(patchBody(created,"\u00a0\ufefftrimmed\u202f")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.diary.diaryTitle").value("trimmed")).andExpect(jsonPath("$.diary.version").value("2"));
    }
    @Test void viewerHasNoAccessButEditorHasCanvasPermissionsAndCannotEditMetadata() throws Exception {
        var created=create();var id=UUID.fromString(id(created));
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'VIEWER','#123456')",id);
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        mvc.perform(get(PATH).header("Authorization","Bearer "+other)).andExpect(jsonPath("$.items").isEmpty());
        jdbc.update("update diary_members set role='EDITOR',is_favorite=true where user_id=202");
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isOk())
            .andExpect(jsonPath("$.diary.myRole").value("EDITOR")).andExpect(jsonPath("$.diary.myMembership.isFavorite").value(true))
            .andExpect(jsonPath("$.diary.permissions.canEditCanvas").value(true)).andExpect(jsonPath("$.diary.permissions.canEditMetadata").value(false));
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+other).contentType(MediaType.APPLICATION_JSON).content(patchBody(created,"no"))).andExpect(status().isForbidden());
    }
    @Test void expiredKeyNeverCreatesAgainAndCleanupPreservesTheLiveDiaryAndTombstone() throws Exception {
        create();
        jdbc.update("update diary_creation_receipts set completed_at=?",Timestamp.from(Instant.now().minusSeconds(86400)));
        mvc.perform(post(PATH).header("Authorization","Bearer "+owner).header("Idempotency-Key","expired-key-unique").contentType(MediaType.APPLICATION_JSON).content(body(1))).andExpect(status().isCreated());
        jdbc.update("update diary_creation_receipts set completed_at=? where key_hash=?",Timestamp.from(Instant.now().minusSeconds(86400)),sha("expired-key-unique"));
        mvc.perform(post(PATH).header("Authorization","Bearer "+owner).header("Idempotency-Key","expired-key-unique").contentType(MediaType.APPLICATION_JSON).content(body(1))).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_EXPIRED"));
        var receipts=new com.f106.DIO.diary.creation.DiaryCreationReceiptRepository(jdbc,5000);
        assertThat(receipts.clearExpiredResponses()).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts where response_body is null and diary_id is not null",Long.class)).isEqualTo(2);
        mvc.perform(post(PATH).header("Authorization","Bearer "+owner).header("Idempotency-Key","expired-key-unique").contentType(MediaType.APPLICATION_JSON).content(body(1))).andExpect(status().isConflict());
    }
    private static String sha(String value) throws Exception {return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
    @Test void listFiltersFavoriteAndCursorScopeAreBoundToTheRequest() throws Exception {
        var first=create();create();
        jdbc.update("update diary_members set is_favorite=true where diary_id=?",UUID.fromString(id(first)));
        mvc.perform(get(PATH).param("favorite","true").header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get(PATH).param("filter","shared").header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.items").isEmpty());
        var page=json.readTree(mvc.perform(get(PATH).param("limit","1").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
        mvc.perform(get(PATH).param("cursor",page.get("nextCursor").asString()).param("filter","personal").header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        var old=(tools.jackson.databind.node.ObjectNode)json.readTree(java.util.Base64.getUrlDecoder().decode(page.get("nextCursor").asString()));
        old.put("v",3);
        String oldCursor=java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(old.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mvc.perform(get(PATH).param("cursor",oldCursor).header("Authorization","Bearer "+owner))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_DIARY_LIST_QUERY"));
    }

    @Test void sharedFilterAndBadgeUseActiveMembersInsteadOfVisibilityAcrossPages() throws Exception {
        String privateShared=id(create()),membersSolo=id(create()),linkSolo=id(create()),formerShared=id(create()),membersShared=id(create());
        jdbc.update("update diaries set visibility='MEMBERS' where diary_id in (?,?)",UUID.fromString(membersSolo),UUID.fromString(membersShared));
        jdbc.update("update diaries set visibility='LINK' where diary_id=?",UUID.fromString(linkSolo));
        for(String id:List.of(privateShared,formerShared,membersShared))
            jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'EDITOR','#654321')",UUID.fromString(id));
        jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=202",UUID.fromString(formerShared));
        var shared=java.util.Set.of(privateShared,membersShared);
        var personal=java.util.Set.of(membersSolo,linkSolo,formerShared);
        for(String sort:List.of("created","updated","title","pages")) {
            for(String filter:List.of("all","personal","shared")) {
                var seen=new java.util.HashSet<String>();String cursor=null;
                do {
                    var request=get(PATH).param("filter",filter).param("sort",sort).param("limit","1").header("Authorization","Bearer "+owner);
                    if(cursor!=null) request.param("cursor",cursor);
                    var page=json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
                    for(var item:page.get("items")) {
                        String id=item.get("diary").get("diaryId").asString();
                        assertThat(seen.add(id)).isTrue();
                        assertThat(item.get("shared").asBoolean()).isEqualTo(shared.contains(id));
                    }
                    cursor=page.get("nextCursor").isNull()?null:page.get("nextCursor").asString();
                    assertThat(page.get("hasNext").asBoolean()).isEqualTo(cursor!=null);
                    assertThat(seen.size()).isLessThanOrEqualTo(5);
                } while(cursor!=null);
                assertThat(seen).containsExactlyInAnyOrderElementsOf(filter.equals("shared")?shared:filter.equals("personal")?personal:java.util.Set.of(privateShared,membersSolo,linkSolo,formerShared,membersShared));
            }
        }
        jdbc.update("update diary_members set is_favorite=true where user_id=101 and diary_id in (?,?)",UUID.fromString(privateShared),UUID.fromString(linkSolo));
        mvc.perform(get(PATH).param("filter","shared").param("favorite","true").header("Authorization","Bearer "+owner))
            .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].diary.diaryId").value(privateShared)).andExpect(jsonPath("$.items[0].shared").value(true));
        mvc.perform(get(PATH).param("filter","personal").param("favorite","true").header("Authorization","Bearer "+owner))
            .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].diary.diaryId").value(linkSolo)).andExpect(jsonPath("$.items[0].shared").value(false));
        mvc.perform(get(PATH).param("filter","shared").header("Authorization","Bearer "+other))
            .andExpect(jsonPath("$.items.length()").value(2));
    }


    @Test void versionMustBeAStringAndNoopAndExhaustionAreExplicit() throws Exception {
        var created=create();String path=PATH+"/"+id(created);
        for(String token:List.of("1","null","\"0\"","\"01\"","\"9223372036854775808\"")) {
            mvc.perform(patch(path).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON)
                .content("{\"diaryTitle\":\"changed\",\"expectedVersion\":"+token+"}")).andExpect(status().isBadRequest());
        }
        mvc.perform(patch(path).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(patchBody(created,"member")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.diary.version").value("1"));
        jdbc.update("update diaries set version=9223372036854775807");
        String max="{\"diaryTitle\":\"changed\",\"expectedVersion\":\"9223372036854775807\"}";
        mvc.perform(patch(path).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(max))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERSION_EXHAUSTED"));
        mvc.perform(patch(path).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(max.replace("changed","member")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.diary.version").value("9223372036854775807"));
    }
    @Test void photoCoverIsSharedOnlyWithActiveDiaryMembers() throws Exception {
        var created=create(); UUID diaryId=UUID.fromString(id(created)); String path=PATH+"/"+diaryId;
        UUID media=UUID.randomUUID();
        mediaFiles.saveAndFlush(new com.f106.DIO.media.domain.MediaFile(media,101L,
            com.f106.DIO.media.domain.MediaType.IMAGE,com.f106.DIO.media.domain.MediaLibraryCategory.PHOTO,
            "cover-fixture-"+media,"cover.png","image/png",42,null));
        var cover=Map.of("kind","photo","enabled",true,"photo",Map.of("src","media:"+media,"mediaFileId",media.toString(),
            "aspect",1.4,"crop",Map.of("x",0.1,"y",0.2,"w",0.7,"h",0.6)),"subtitle",Map.of("text","같은 사진 표지"));
        String payload=json.writeValueAsString(Map.of("expectedVersion","1","cover",cover));
        try {
            mvc.perform(patch(path).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON)
                .content(payload.replace("media:"+media,"file:///private-cover.png")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_DIARY_COVER"));
            mvc.perform(patch(path).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isOk()).andExpect(jsonPath("$.diary.version").value("2"))
                .andExpect(jsonPath("$.diary.cover.photo.mediaFileId").value(media.toString()));
            mvc.perform(get(path).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
            assertThatThrownBy(()->mediaAccess.storageReference(media,202L)).isInstanceOf(com.f106.DIO.media.support.MediaFileNotFoundException.class);
            jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,joined_at) values (?,202,'EDITOR','#654321',?)",diaryId,Timestamp.from(Instant.now()));
            mvc.perform(get(path).header("Authorization","Bearer "+other)).andExpect(status().isOk())
                .andExpect(jsonPath("$.diary.cover.photo.src").value("media:"+media))
                .andExpect(jsonPath("$.diary.cover.photo.crop.x").value(0.1));
            mvc.perform(get(PATH).param("filter","shared").header("Authorization","Bearer "+other)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].diary.cover.photo.mediaFileId").value(media.toString()));
            assertThat(mediaAccess.storageReference(media,202L).storageKey()).isEqualTo("cover-fixture-"+media);
            mvc.perform(patch(path).header("Authorization","Bearer "+other).contentType(MediaType.APPLICATION_JSON).content(payload.replace("\"1\"","\"2\"")))
                .andExpect(status().isForbidden());
            jdbc.update("update diary_members set left_at=? where diary_id=? and user_id=202",Timestamp.from(Instant.now()),diaryId);
            assertThatThrownBy(()->mediaAccess.storageReference(media,202L)).isInstanceOf(com.f106.DIO.media.support.MediaFileNotFoundException.class);
        } finally {mediaFiles.deleteById(media);}
    }

    @Test void concurrentSameVersionWritesHaveExactlyOneWinner() throws Exception {
        var created=create();String path=PATH+"/"+id(created),payload=patchBody(created,"winner");
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var gate=new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.Callable<Integer> action=()->{gate.await();return mvc.perform(patch(path).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content(payload)).andReturn().getResponse().getStatus();};
            var a=executor.submit(action);var b=executor.submit(action);gate.countDown();
            assertThat(List.of(a.get(15,java.util.concurrent.TimeUnit.SECONDS),b.get(15,java.util.concurrent.TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
            assertThat(jdbc.queryForObject("select version from diaries",Long.class)).isEqualTo(2L);
        } finally {executor.shutdownNow();}
    }

}
