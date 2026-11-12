package com.f106.DIO.diary.http;

import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.repository.RefreshTokenHistoryRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.support.LoginSecrets;

import java.sql.Timestamp;
import java.time.Instant;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:member-diary-http;MODE=PostgreSQL",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}) // 다른 회원 다이어리 HTTP 테스트와 같은 설정으로 스프링 컨텍스트를 함께 쓴다
@AutoConfigureMockMvc @ActiveProfiles("test")
class MemberDiaryUsageHttpTests {
    static final String PATH="/api/v1/member/diaries";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired LoginJwt jwt;
    @Autowired RefreshTokenRepository sessions;
    @Autowired RefreshTokenHistoryRepository history;
    @MockitoSpyBean MemberDiaryCreationService creation;
    @MockitoSpyBean MemberDiaryListQuery lists;
    String owner,other,stranger;

    @BeforeEach void fixtures() {
        jdbc.execute("create table if not exists page_templates(template_id bigint primary key,code varchar(100),template_version varchar(30),name varchar(100),category varchar(30),orientation varchar(20),canvas_width decimal(10,2),canvas_height decimal(10,2),default_config jsonb,is_active boolean default true)");
        jdbc.execute("create table if not exists pages(page_id uuid primary key,diary_id uuid,template_id bigint,template_config jsonb,sort_key decimal(20,10),canvas_width decimal(10,2),canvas_height decimal(10,2),created_at timestamp(6) with time zone,updated_at timestamp(6) with time zone,deleted_at timestamp(6) with time zone)");
        jdbc.execute("create table if not exists diary_members(diary_id uuid,user_id bigint,role varchar(20),is_favorite boolean not null default false,member_color char(7),joined_at timestamp(6) with time zone,left_at timestamp(6) with time zone,primary key(diary_id,user_id))");
        jdbc.execute("create table if not exists diary_creation_receipts(user_id bigint,key_hash char(64),request_hash char(64),diary_id uuid,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
        jdbc.update("delete from diary_creation_receipts");
        com.f106.DIO.diary.MemberH2Fixture.align(jdbc);
        jdbc.update("delete from canvas_elements");
        jdbc.update("delete from pages"); jdbc.update("delete from diary_members"); jdbc.update("delete from diaries");
        jdbc.update("delete from page_templates"); history.deleteAll(); sessions.deleteAll(); jdbc.update("delete from users");
        for(long id:new long[]{101,202,303}) jdbc.update("insert into users(user_id,nickname,nickname_key,profile_color,status,created_at,updated_at) values(?,?,?,'#123456','ACTIVE',?,?)",
            id,"user"+id,"user"+id,Timestamp.from(Instant.now()),Timestamp.from(Instant.now()));
        jdbc.update("insert into page_templates(template_id,code,template_version,name,category,orientation,canvas_width,canvas_height) values(10,'2026-cover-landscape','1.0.0','QA','COVER','LANDSCAPE',1024,768)");
        owner=access(101); other=access(202); stranger=access(303);
    }
    String access(long id) {
        RefreshToken session=sessions.saveAndFlush(new RefreshToken(id,LoginSecrets.hash(UUID.randomUUID().toString()),"test",Instant.now(),Instant.now().plusSeconds(600)));
        return jwt.issue(id,session.getSessionId(),Instant.now(),Instant.now().plusSeconds(300));
    }
    JsonNode create(String token,int pages) throws Exception {
        String body=json.writeValueAsString(Map.of("diaryTitle","usage","coverColor","#123456","coverStyle","PLAIN",
            "initialPages",java.util.Collections.nCopies(pages,Map.of("templateCode","2026-cover-landscape","templateVersion","1.0.0","templateConfig",Map.of("width",1024,"height",768)))));
        return json.readTree(mvc.perform(post(PATH).header("Idempotency-Key","usage-key-"+UUID.randomUUID()).header("Authorization","Bearer "+token)
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsByteArray());
    }
    void element(String pageId,boolean deleted) {
        Timestamp now=Timestamp.from(Instant.now());
        jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,rotation,opacity,is_locked,is_hidden,version,created_at,updated_at,deleted_at) values(?,?,'TEXT',1,0,0,10,10,0,1,false,false,1,?,?,?)",
            UUID.randomUUID(),UUID.fromString(pageId),now,now,deleted?now:null);
    }
    JsonNode usage(String token) throws Exception {
        return json.readTree(mvc.perform(get(PATH+"/usage").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsByteArray());
    }
    JsonNode item(JsonNode usage,String diaryId) {
        for(var item:usage.get("diaries")) if(item.get("diaryId").asString().equals(diaryId)) return item;
        return null;
    }

    @Test void countsOwnAndJoinedSharedDiariesWithPagesAndElements() throws Exception {
        var mine=create(owner,3); String mineId=mine.get("diary").get("diaryId").asString();
        var pages=mine.get("pageIds");
        element(pages.get(0).asString(),false); element(pages.get(0).asString(),false); element(pages.get(1).asString(),false);
        element(pages.get(1).asString(),true); // 지운 요소는 세지 않는다
        jdbc.update("update pages set deleted_at=? where page_id=?",Timestamp.from(Instant.now()),UUID.fromString(pages.get(2).asString()));
        element(pages.get(2).asString(),false); // 지운 속지의 요소도 세지 않는다

        String sharedId=create(other,2).get("diary").get("diaryId").asString();
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,joined_at) values(?,101,'EDITOR','#654321',?)",UUID.fromString(sharedId),Timestamp.from(Instant.now()));
        create(stranger,1); // 참여하지 않은 다이어리
        String trashed=create(owner,1).get("diary").get("diaryId").asString();
        mvc.perform(delete(PATH+"/"+trashed).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());

        var result=usage(owner);
        assertThat(result.get("diaryCount").asLong()).isEqualTo(2);
        assertThat(result.get("diaries").size()).isEqualTo(2);
        var own=item(result,mineId);
        assertThat(own.get("owned").asBoolean()).isTrue();
        assertThat(own.get("pageCount").asLong()).isEqualTo(2);
        assertThat(own.get("elementCount").asLong()).isEqualTo(3);
        var shared=item(result,sharedId);
        assertThat(shared.get("owned").asBoolean()).isFalse();
        assertThat(shared.get("pageCount").asLong()).isEqualTo(2);
        assertThat(shared.get("elementCount").asLong()).isZero();

        // 공유 다이어리에서 나가면 더 이상 세지 않는다
        jdbc.update("update diary_members set left_at=? where diary_id=? and user_id=101",Timestamp.from(Instant.now()),UUID.fromString(sharedId));
        assertThat(usage(owner).get("diaryCount").asLong()).isEqualTo(1);
    }
    @Test void emptyAccountAndMissingToken() throws Exception {
        var result=usage(owner);
        assertThat(result.get("diaryCount").asLong()).isZero();
        assertThat(result.get("diaries").size()).isZero();
        mvc.perform(get(PATH+"/usage")).andExpect(status().isUnauthorized());
    }
}
