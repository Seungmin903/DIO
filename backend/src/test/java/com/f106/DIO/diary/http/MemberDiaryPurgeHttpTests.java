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

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:member-purge-http;MODE=PostgreSQL"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class MemberDiaryPurgeHttpTests {
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
        jdbc.execute("create table if not exists page_templates(template_id bigint primary key,code varchar(100),template_version varchar(30),name varchar(100),category varchar(30),orientation varchar(20),canvas_width decimal(10,2),canvas_height decimal(10,2),default_config jsonb,is_active boolean default true)");
        jdbc.execute("create table if not exists pages(page_id uuid primary key,diary_id uuid,template_id bigint,template_config jsonb,sort_key decimal(20,10),canvas_width decimal(10,2),canvas_height decimal(10,2),created_at timestamp(6) with time zone,updated_at timestamp(6) with time zone,deleted_at timestamp(6) with time zone)");
        jdbc.execute("create table if not exists diary_members(diary_id uuid,user_id bigint,role varchar(20),is_favorite boolean not null default false,member_color char(7),joined_at timestamp(6) with time zone,left_at timestamp(6) with time zone,primary key(diary_id,user_id))");
        jdbc.execute("create table if not exists diary_creation_receipts(user_id bigint,key_hash char(64),request_hash char(64),diary_id uuid,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
        jdbc.execute("alter table diary_members add column if not exists last_opened_page_id uuid");
        jdbc.execute("create table if not exists canvas_elements(element_id uuid primary key,page_id uuid)");
        jdbc.execute("create table if not exists element_strokes(element_id uuid)");
        jdbc.execute("create table if not exists canvas_history_operations(page_id uuid)");
        jdbc.execute("create table if not exists notifications(notification_id bigint,diary_id uuid,page_id uuid,payload_json jsonb)");
        for(String table:List.of("diary_invites","diary_media_library","diary_handwriting_fonts")) jdbc.execute("create table if not exists "+table+"(diary_id uuid)");
        for(String table:List.of("element_strokes","canvas_elements","canvas_history_operations","notifications","diary_invites","diary_media_library","diary_handwriting_fonts")) jdbc.update("delete from "+table);
        jdbc.execute("create table if not exists diary_purge_receipts(diary_id uuid primary key,owner_user_id bigint not null,completed_at timestamp(6) with time zone not null)");
        jdbc.update("delete from diary_purge_receipts");
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



    @Test void realCreateTrashPurgeAndSameKeyReplayCannotRecreateTheDiary() throws Exception {
        String id=id(create()),key=lastKey;
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+owner)).andExpect(status().isNoContent()).andExpect(header().string("Cache-Control","no-store"));
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from pages",Long.class)).isZero();
        mvc.perform(post(PATH).header("Authorization","Bearer "+owner).header("Idempotency-Key",key).contentType(MediaType.APPLICATION_JSON).content(body(2)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_RESULT_UNAVAILABLE"));
        var completed=jdbc.queryForObject("select completed_at from diary_purge_receipts where diary_id=?",Timestamp.class,UUID.fromString(id));
        mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+owner)).andExpect(status().isNoContent()).andExpect(content().string(""));
        assertThat(jdbc.queryForObject("select completed_at from diary_purge_receipts where diary_id=?",Timestamp.class,UUID.fromString(id))).isEqualTo(completed);
        mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        mvc.perform(post(PATH+"/"+id+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts where response_body is null and diary_id is null and completed_at is not null",Long.class)).isEqualTo(1);
    }
    @Test void activeDiaryIs409ButForeignAndMissingIdAreAlways404() throws Exception {
        String id=id(create());
        mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+owner)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DIARY_NOT_TRASHED"));
        for(String target:List.of(id,UUID.randomUUID().toString())) mvc.perform(delete(PATH+"/"+target+"/purge").header("Authorization","Bearer "+other)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("DIARY_NOT_FOUND"));
        mvc.perform(delete(PATH+"/bad/purge").header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
    }
    @Test void unauthenticatedForgedExpiredAndRevokedSessionsCannotPurge() throws Exception {
        String id=id(create());
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        String expired=jwt.issue(101L,ownerSession.getSessionId(),Instant.now().minusSeconds(600),Instant.now().minusSeconds(60));
        for(String token:List.of("",owner+"corrupt",expired)) mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization",token.isEmpty()?"":"Bearer "+token).header("X-User-Id","101")).andExpect(status().isUnauthorized());
        ownerSession.revoke(Instant.now());sessions.saveAndFlush(ownerSession);
        mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+owner)).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
    }
    @Test void editorLeftOwnerAndSuspendedUserCannotPurge() throws Exception {
        String id=id(create());
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,202,'EDITOR','#123456')",UUID.fromString(id));
        mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+other)).andExpect(status().isForbidden());
        jdbc.update("update diary_members set left_at=current_timestamp where user_id=101");
        mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+owner)).andExpect(status().isNotFound());
        jdbc.update("update users set status='SUSPENDED' where user_id=101");
        mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+owner)).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
    }
    @Test void rejectsBodyAndQueryAndPublishesActualPurgeContract() throws Exception {
        String id=id(create());
        mvc.perform(delete(PATH+"/"+id).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        mvc.perform(delete(PATH+"/"+id+"/purge?force=true").header("Authorization","Bearer "+owner)).andExpect(status().isBadRequest());
        mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        var payload=new java.util.LinkedHashMap<String,Object>();
        payload.put("trash",json.readTree(mvc.perform(get(PATH+"/trash").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()));
        var response=mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+owner)).andExpect(status().isNoContent()).andExpect(content().string("")).andReturn().getResponse();
        payload.put("purge",Map.of("status",response.getStatus(),"body",response.getContentAsString()));
        payload.put("retryStatus",mvc.perform(delete(PATH+"/"+id+"/purge").header("Authorization","Bearer "+owner)).andExpect(status().isNoContent()).andReturn().getResponse().getStatus());
        var doc=json.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
        var operation=doc.get("paths").get(PATH+"/{diaryId}/purge").get("delete");
        assertThat(operation.has("requestBody")).isFalse();assertThat(operation.get("parameters").size()).isEqualTo(1);
        assertThat(operation.get("responses").has("200")).isFalse();assertThat(operation.get("responses").get("204").has("content")).isFalse();
        payload.put("openapi",doc);
        var file=java.nio.file.Path.of("build/contracts/member-diary-purge-http.json");java.nio.file.Files.createDirectories(file.getParent());java.nio.file.Files.writeString(file,json.writeValueAsString(payload),java.nio.charset.StandardCharsets.UTF_8);
    }
}
