package com.f106.DIO.diary;

import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.dto.LoginResponse;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import static org.assertj.core.api.Assertions.assertThat;

/** Real HTTP login, active-session JWT filter and read SQL. No sharing implementation is imported. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:diary-create-http;MODE=PostgreSQL",
    "dio.auth.session-cleanup.enabled=false"
})
abstract class DiaryHttpTestSupport {
    @DynamicPropertySource static void key(DynamicPropertyRegistry registry) {
        byte[] secret = new byte[32]; new java.security.SecureRandom().nextBytes(secret);
        registry.add("dio.auth.jwt-secret", () -> Base64.getEncoder().encodeToString(secret));
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    final HttpClient client = HttpClient.newHttpClient();
    final tools.jackson.databind.json.JsonMapper json = tools.jackson.databind.json.JsonMapper.builder().build();
    long owner, editor, stranger;
    String token, editorToken, strangerToken;
    static UUID id(int n) { return UUID.fromString("00000000-0000-0000-0000-" + String.format("%012d", n)); }
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    com.f106.DIO.diary.create.FirstDiaryPageWriter pages;
    @Autowired com.f106.DIO.diary.create.AccountDiaryCreationService creation;
    @BeforeEach void fixtures() throws Exception {
        try(var connection=jdbc.getDataSource().getConnection()) {
            if(connection.getMetaData().getDatabaseProductName().equals("PostgreSQL")) {
                assertThat(System.getenv("DIO_DIARY_CREATE_PG_QA")).isEqualTo("true");
                assertThat(jdbc.queryForObject("select current_database()",String.class)).isEqualTo("dio_diary_create_qa");
            }
        }
        jdbc.execute("create table if not exists diary_members(diary_id uuid,user_id bigint,role varchar(20),member_color char(7),is_favorite boolean not null,joined_at timestamp with time zone,left_at timestamp with time zone,primary key(diary_id,user_id))");
        jdbc.execute("create table if not exists pages(page_id uuid primary key,diary_id uuid,sort_key numeric(20,10),canvas_width numeric(10,2),canvas_height numeric(10,2),version bigint,created_at timestamp with time zone,updated_at timestamp with time zone,deleted_at timestamp with time zone)");
        jdbc.execute("create table if not exists diary_creation_requests(user_id bigint,request_key uuid,request_hash char(64),diary_id uuid,response_body text,created_at timestamp with time zone,expires_at timestamp with time zone,primary key(user_id,request_key))");
        jdbc.execute("create table if not exists diary_purge_receipts(diary_id uuid primary key,owner_user_id bigint not null,completed_at timestamp with time zone not null)");
        jdbc.update("delete from diary_purge_receipts");
        jdbc.update("delete from diary_creation_requests"); jdbc.update("delete from diary_members"); jdbc.update("delete from pages"); jdbc.update("delete from diaries");
        jdbc.update("delete from refresh_token_history");jdbc.update("delete from refresh_tokens");accounts.deleteAll();users.deleteAll();
        owner=user("owner@dio.test");editor=user("editor@dio.test");
        token=login("owner@dio.test").accessToken();editorToken=login("editor@dio.test").accessToken();
    }
    long user(String email) {
        var user=users.saveAndFlush(new User(email,email,Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),email,new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4).encode("DioMember123!"),Instant.now()));
        return user.getUserId();
    }
    HttpResponse<String> request(String method,String path,String bearer,String body,String... headers) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path));
        if(bearer!=null)b.header("Authorization","Bearer "+bearer);
        if(body!=null)b.header("Content-Type","application/json");
        for(int n=0;n<headers.length;n+=2)b.header(headers[n],headers[n+1]);
        return client.send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
    }
    LoginResponse login(String email) throws Exception {
        var r=request("POST","/api/v1/auth/login",null,"{\"email\":\""+email+"\",\"password\":\"DioMember123!\"}");
        assertThat(r.statusCode()).isEqualTo(200); return json.readValue(r.body(),LoginResponse.class);
    }
    HttpResponse<String> get(String suffix,String bearer) throws Exception {return request("GET","/api/v1/diaries"+suffix,bearer,null);}
    static String input(String title,String orientation){return "{\"diaryTitle\":\""+title+"\",\"coverColor\":\"#aabbcc\",\"coverStyle\":\"PLAIN\",\"firstPage\":{\"type\":\"BLANK\",\"orientation\":\""+orientation+"\"}}";}
    HttpResponse<String> create(String key,String body,String bearer) throws Exception {return request("POST","/api/v1/diaries",bearer,body,"Idempotency-Key",key);}
    long count(String table){return jdbc.queryForObject("select count(*) from "+table,Long.class);}
}
