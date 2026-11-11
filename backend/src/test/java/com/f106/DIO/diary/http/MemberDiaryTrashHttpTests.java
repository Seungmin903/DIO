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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:member-diary-http;MODE=PostgreSQL",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}) // 회원 다이어리 HTTP 테스트 3종이 같은 설정을 써서 스프링 컨텍스트 하나를 함께 쓴다
@AutoConfigureMockMvc @ActiveProfiles("test")
class MemberDiaryTrashHttpTests {
    static final String PATH="/api/v1/member/diaries";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired LoginJwt jwt;
    @Autowired RefreshTokenRepository sessions;
    @Autowired RefreshTokenHistoryRepository history;
    @MockitoSpyBean MemberDiaryCreationService creation;
    @MockitoSpyBean MemberDiaryListQuery lists; // MemberDiaryHttpTests 와 같은 스파이 구성으로 맞춰 스프링 컨텍스트를 함께 쓴다
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
        jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height) values(10,'2026-cover-landscape','1.0.0','QA','COVER','LANDSCAPE',1024,768)");
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


    @Test void ownerCanTrashListAndRestoreWhileActiveEndpointsHideDeletedRows() throws Exception {
        String id=id(create());
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent()).andExpect(header().string("Cache-Control","no-store"));
        Timestamp deleted=jdbc.queryForObject("select deleted_at from diaries where diary_id=?",Timestamp.class,UUID.fromString(id));
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select deleted_at from diaries where diary_id=?",Timestamp.class,UUID.fromString(id))).isEqualTo(deleted);
        mvc.perform(get(PATH).header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNotFound());
        mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andExpect(jsonPath("$.items[0].diaryId").value(id)).andExpect(jsonPath("$.items[0].canRestore").value(true));
        String first=mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andExpect(jsonPath("$.diary.canEdit").value(true)).andReturn().getResponse().getContentAsString();
        String repeated=mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(repeated)).isEqualTo(json.readTree(first));
        mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isOk());
    }
    @Test void trashRowsCarryDiaryTemplateConfigSoCoversKeepTheirOrientation() throws Exception {
        String portrait=id(create()),legacy=id(create());
        jdbc.update("update diaries set template_config_json=? where diary_id=?","{\"orientation\":\"portrait\"}",UUID.fromString(portrait));
        for(String id:List.of(portrait,legacy)) mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        var items=json.readTree(mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()).get("items");
        for(var item:items) {
            if(item.get("diaryId").asString().equals(portrait)) assertThat(item.get("templateConfig").get("orientation").asString()).isEqualTo("portrait");
            else assertThat(item.get("templateConfig")==null||item.get("templateConfig").isNull()).isTrue();
        }
        assertThat(items.size()).isEqualTo(2);
    }
    @Test void corruptStoredTemplateConfigIsReplacedOnlyByAValidatedRequestValue() throws Exception {
        String id=id(create());var uuid=UUID.fromString(id);
        jdbc.update("update diaries set template_config_json=? where diary_id=?","{not json",uuid);
        // 제목만 바꾸면 깨진 저장 값은 손대지 않는다(정상 값처럼 다시 쓰지 않는다).
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content("{\"diaryTitle\":\"renamed\",\"expectedVersion\":\"1\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.diary.templateConfig").doesNotExist());
        assertThat(jdbc.queryForObject("select template_config_json from diaries where diary_id=?",String.class,uuid)).isEqualTo("{not json");
        // 구성을 보내면 검증된 요청 값으로 바뀐다.
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content("{\"templateConfig\":{\"orientation\":\"portrait\"},\"expectedVersion\":\"2\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.diary.templateConfig.orientation").value("portrait"));
        assertThat(json.readTree(jdbc.queryForObject("select template_config_json from diaries where diary_id=?",String.class,uuid)).get("orientation").asString()).isEqualTo("portrait");
    }
    @Test void corruptStoredTemplateConfigBecomesNullWithoutFailingTheTrashList() throws Exception {
        String broken=id(create()),array=id(create()),healthy=id(create());
        jdbc.update("update diaries set template_config_json=? where diary_id=?","{not json",UUID.fromString(broken));
        jdbc.update("update diaries set template_config_json=? where diary_id=?","[1,2]",UUID.fromString(array));
        jdbc.update("update diaries set template_config_json=? where diary_id=?","{\"orientation\":\"portrait\"}",UUID.fromString(healthy));
        for(String id:List.of(broken,array,healthy)) mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        var items=json.readTree(mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()).get("items");
        assertThat(items.size()).isEqualTo(3);
        for(var item:items) {
            if(item.get("diaryId").asString().equals(healthy)) assertThat(item.get("templateConfig").get("orientation").asString()).isEqualTo("portrait");
            else assertThat(item.get("templateConfig")==null||item.get("templateConfig").isNull()).isTrue();
        }
    }
    @Test void missingForgedExpiredAndRevokedTokensCannotUseAnyTrashEndpoint() throws Exception {
        String id=id(create());
        String expired=jwt.issue(101L,ownerSession.getSessionId(),Instant.now().minusSeconds(600),Instant.now().minusSeconds(60));
        for(String token:List.of("",owner+"corrupt",expired)) {
            mvc.perform(get(PATH+"/trash").header("Authorization",token.isEmpty()?"":"Bearer "+token).header("X-User-Id","101")).andExpect(status().isUnauthorized());
            mvc.perform(delete(PATH+"/"+id).header("Authorization",token.isEmpty()?"":"Bearer "+token)).andExpect(status().isUnauthorized());
            mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization",token.isEmpty()?"":"Bearer "+token)).andExpect(status().isUnauthorized());
        }
        ownerSession.revoke(Instant.now());sessions.saveAndFlush(ownerSession);
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select deleted_at from diaries where diary_id=?",Timestamp.class,UUID.fromString(id))).isNull();
    }
    @Test void otherMemberAndLeftOwnerCannotDeleteRestoreOrListOwnerTrash() throws Exception {
        String id=id(create());
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'EDITOR','#123456')",UUID.fromString(id));
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DIARY_OWNER_REQUIRED"));
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+other)).andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+other)).andExpect(status().isForbidden());
        jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=101",UUID.fromString(id));
        mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isNotFound());
        mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.items.length()").value(0));
    }
    @Test void expiryIs410AndForeignExpiryStill404AndInvalidUuid400() throws Exception {
        String id=id(create());
        jdbc.update("update diaries set deleted_at=? where diary_id=?",Timestamp.from(Instant.now().minusSeconds(31*86400)),UUID.fromString(id));
        mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isGone()).andExpect(jsonPath("$.code").value("DIARY_RESTORE_EXPIRED")).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        mvc.perform(post(PATH+"/bad/restore").header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        mvc.perform(delete(PATH+"/bad").header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.items[0].canRestore").value(false));
    }
    @Test void cursorsSearchAndValidationStayWithinTheAuthenticatedOwner() throws Exception {
        String a=id(create()),b=id(create());
        for(String id:List.of(a,b)) mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        jdbc.update("update diaries set title='literal%_title' where diary_id=?",UUID.fromString(a));
        mvc.perform(get(PATH+"/trash").param("q","%_").header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.items.length()").value(1));
        var first=json.readTree(mvc.perform(get(PATH+"/trash").param("limit","1").header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.hasNext").value(true)).andReturn().getResponse().getContentAsByteArray());
        String cursor=first.get("nextCursor").asString();
        mvc.perform(get(PATH+"/trash").param("limit","1").param("cursor",cursor).header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.hasNext").value(false));
        mvc.perform(get(PATH+"/trash").param("cursor",cursor).header("Authorization","Bearer "+other)).andExpect(status().isBadRequest());
        mvc.perform(get(PATH+"/trash").param("cursor",cursor).param("q","different").header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        for(String limit:List.of("0","101","bad")) mvc.perform(get(PATH+"/trash").param("limit",limit).header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
    }
    @Test void deleteCorsWorksAndSuspendedUserAndLegacyPathCannotBypassOwnership() throws Exception {
        String id=id(create());
        mvc.perform(options(PATH+"/"+id).header("Origin","http://localhost:8081").header("Access-Control-Request-Method","DELETE").header("Access-Control-Request-Headers","authorization")).andExpect(status().isOk());
        mvc.perform(options(PATH+"/"+id).header("Origin","https://foreign.example").header("Access-Control-Request-Method","DELETE")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/diaries/"+id)).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/diaries/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNotFound());
        jdbc.update("update users set status='SUSPENDED' where user_id=101");
        mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+owner)).andExpect(status().isUnauthorized());
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select deleted_at from diaries where diary_id=?",Timestamp.class,UUID.fromString(id))).isNull();
    }

    @Test void transitionsIncrementVersionAndRepeatedCallsPreserveAllState() throws Exception {
        var created=create();String id=id(created);var uuid=UUID.fromString(id);
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        var state=jdbc.queryForMap("select deleted_at,updated_at,version from diaries where diary_id=?",uuid);
        assertThat(((Number)state.get("version")).longValue()).isEqualTo(2L);
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForMap("select deleted_at,updated_at,version from diaries where diary_id=?",uuid)).isEqualTo(state);
        mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andExpect(jsonPath("$.diary.version").value("3"));
        var restored=jdbc.queryForMap("select updated_at,version from diaries where diary_id=?",uuid);
        mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(jsonPath("$.diary.version").value("3"));
        assertThat(jdbc.queryForMap("select updated_at,version from diaries where diary_id=?",uuid)).isEqualTo(restored);
        mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content("{\"diaryTitle\":\"stale\",\"expectedVersion\":\"1\"}")).andExpect(status().isConflict());
    }
    @Test void invalidBodiesQueriesAndExhaustionCannotChangeTheDiary() throws Exception {
        String id=id(create());
        for(String query:List.of("?permanent=true","?permanent=false","?other=1"))mvc.perform(delete(PATH+"/"+id+query).header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        jdbc.update("update diaries set version=9223372036854775807");
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VERSION_EXHAUSTED"));
        jdbc.update("update diaries set deleted_at=current_timestamp");
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isConflict());
    }
    @Test void exportActualLifecycleResponsesForFrontend() throws Exception {
        var created=create();String id=id(created);var results=new java.util.LinkedHashMap<String,Object>();results.put("created",created);
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        results.put("trash",json.readTree(mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()));
        results.put("restored",json.readTree(mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()));
        results.put("unauthorized",json.readTree(mvc.perform(get(PATH+"/trash")).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsByteArray()));
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'EDITOR','#123456')",UUID.fromString(id));
        results.put("forbidden",json.readTree(mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isForbidden()).andReturn().getResponse().getContentAsByteArray()));
        jdbc.update("update diary_members set left_at=current_timestamp where user_id=202");
        results.put("missing",json.readTree(mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsByteArray()));
        jdbc.update("update diaries set deleted_at=?",Timestamp.from(Instant.now().minusSeconds(30L*86400)));
        results.put("expired",json.readTree(mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isGone()).andReturn().getResponse().getContentAsByteArray()));
        results.put("openapi",json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()));
        var file=java.nio.file.Path.of("build/contracts/member-diary-trash-http.json");java.nio.file.Files.createDirectories(file.getParent());java.nio.file.Files.writeString(file,json.writeValueAsString(results),java.nio.charset.StandardCharsets.UTF_8);
    }


    @Test void openApiUses204WithoutBodyAndRequiresVersionAndExpiryInTrashRows() throws Exception {
        var doc=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
        var responses=doc.get("paths").get(PATH+"/{diaryId}").get("delete").get("responses");
        assertThat(doc.get("paths").get(PATH+"/{diaryId}").get("delete").has("requestBody")).isFalse();
        assertThat(doc.get("paths").get(PATH+"/{diaryId}/restore").get("post").has("requestBody")).isFalse();
        assertThat(doc.get("paths").get(PATH+"/{diaryId}").get("delete").get("parameters").size()).isEqualTo(1);
        assertThat(doc.get("paths").get(PATH+"/{diaryId}/restore").get("post").get("parameters").size()).isEqualTo(1);
        assertThat(responses.has("204")).isTrue();assertThat(responses.has("200")).isFalse();assertThat(responses.get("204").has("content")).isFalse();
        var ref=doc.get("paths").get(PATH+"/trash").get("get").get("responses").get("200").get("content").get("application/json").get("schema").get("$ref").asString();
        var list=doc.at(ref.substring(1));var itemRef=list.get("properties").get("items").get("items").get("$ref").asString();var item=doc.at(itemRef.substring(1));
        var required=new java.util.ArrayList<String>();for(var field:item.get("required"))required.add(field.asString());
        assertThat(doc.get("paths").get(PATH).get("get").get("responses").has("200")).isTrue();
        assertThat(doc.get("components").get("schemas").get("MemberDiaryListItem").get("properties").has("diary")).isTrue();
        assertThat(doc.get("components").get("schemas").get("Item").get("properties").has("notification")).isTrue();
        assertThat(required).contains("version","deletedAt","purgeAt","canRestore");assertThat(item.get("properties").get("version").get("type").asString()).isEqualTo("string");
    }
}
