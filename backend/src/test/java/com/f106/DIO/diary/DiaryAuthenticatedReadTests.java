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
    "spring.datasource.url=jdbc:h2:mem:diary-read-http;MODE=PostgreSQL",
    "dio.auth.session-cleanup.enabled=false"
})
class DiaryAuthenticatedReadTests {
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
    @BeforeEach void fixtures() throws Exception {
        jdbc.execute("create table if not exists diary_members(diary_id uuid,user_id bigint,role varchar(20),is_favorite boolean not null,left_at timestamp with time zone,primary key(diary_id,user_id))");
        jdbc.execute("create table if not exists pages(page_id uuid primary key,diary_id uuid,sort_key numeric(20,10),deleted_at timestamp with time zone)");
        jdbc.update("delete from pages"); jdbc.update("delete from diary_members"); jdbc.update("delete from diaries");
        jdbc.update("delete from refresh_token_history"); jdbc.update("delete from refresh_tokens"); accounts.deleteAll(); users.deleteAll();
        owner = user("owner@dio.test"); editor = user("editor@dio.test"); stranger = user("stranger@dio.test");
        token=login("owner@dio.test").accessToken(); editorToken=login("editor@dio.test").accessToken(); strangerToken=login("stranger@dio.test").accessToken();
        for (int n=1;n<=8;n++) jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility,created_at,updated_at,deleted_at) values(?,?,?,?,?,?,?,?,?)",
            id(n), n==7 ? null : owner, n==1 ? "100%_literal" : "Diary " + n, "#CED9EE", "PLAIN", n==1 ? "PRIVATE" : "MEMBERS",
            Instant.parse("2026-01-01T00:00:00.123456Z"), Instant.parse("2026-01-02T00:00:00.123456Z"), n==4 ? Instant.now().minusSeconds(60) : n==8 ? Instant.now().minusSeconds(31*86400L) : null);
        member(1,owner,"OWNER",true,null); member(2,editor,"EDITOR",true,null);
        member(3,editor,"EDITOR",false,Instant.now()); member(4,editor,"EDITOR",false,null);
        member(5,editor,"VIEWER",false,null); member(6,editor,"OWNER",false,null);
        member(7,editor,"EDITOR",false,null);
        jdbc.update("insert into pages values(?,?,?,null)",id(101),id(2),10);
        jdbc.update("insert into pages values(?,?,?,null)",id(102),id(2),2);
        jdbc.update("insert into pages values(?,?,?,current_timestamp)",id(103),id(2),0);
    }
    void member(int diary,long user,String role,boolean favorite,Instant left) {
        jdbc.update("insert into diary_members values(?,?,?,?,?)",id(diary),user,role,favorite,left);
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
    @Test void scopesReadToActiveOwnerOrEditorAndNeverUsesClaimedUserHeader() throws Exception {
        var list=get("?userId="+owner,editorToken); assertThat(list.statusCode()).isEqualTo(200);
        var items=json.readTree(list.body()).path("items"); assertThat(items.size()).isEqualTo(1);
        assertThat(items.get(0).path("diaryId").asText()).isEqualTo(id(2).toString());
        for(int n:new int[]{1,3,4,5,6,7,8})assertThat(get("/"+id(n),editorToken).statusCode()).isEqualTo(404);
        assertThat(get("/"+id(2),strangerToken).statusCode()).isEqualTo(404);
        assertThat(json.readTree(get("",strangerToken).body()).path("items").size()).isZero();
        var spoof=request("GET","/api/v1/diaries/"+id(1),editorToken,null,"X-User-Id",Long.toString(owner));
        assertThat(spoof.statusCode()).isEqualTo(404);
        member(3,owner,"OWNER",false,Instant.now()); assertThat(get("/"+id(3),token).statusCode()).isEqualTo(404);
    }
    @Test void rejectsMissingTamperedRefreshAndRevokedSessionTokens() throws Exception {
        var login=login("owner@dio.test");
        for(String bad:new String[]{null,token+"x",login.refreshToken()}){
            var r=get("",bad); assertThat(r.statusCode()).isEqualTo(401); assertThat(r.body()).contains("AUTHENTICATION_REQUIRED");
            assertThat(r.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        }
        assertThat(request("POST","/api/v1/auth/logout",login.accessToken(),null).statusCode()).isEqualTo(204);
        assertThat(get("",login.accessToken()).statusCode()).isEqualTo(401);
        assertThat(get("",token).statusCode()).isEqualTo(200);
    }
    @Test void returnsActualPagesMembershipPermissionsAndNullableFields() throws Exception {
        var response=get("/"+id(2),editorToken); assertThat(response.statusCode()).isEqualTo(200);
        var row=json.readTree(response.body()).path("diary");
        assertThat(row.path("myRole").asText()).isEqualTo("EDITOR");
        assertThat(row.path("myMembership").path("isFavorite").asBoolean()).isTrue();
        assertThat(row.path("pageCount").asInt()).isEqualTo(2);
        assertThat(row.path("firstPageId").asText()).isEqualTo(id(102).toString());
        assertThat(row.path("permissions").path("canEditCanvas").asBoolean()).isTrue();
        assertThat(row.path("permissions").path("canEditMetadata").asBoolean()).isFalse();
        assertThat(row.path("deletedAt").isNull()).isTrue(); assertThat(row.path("expiresAt").isNull()).isTrue();
        var ownerRow=json.readTree(get("/"+id(1),token).body()).path("diary");
        assertThat(ownerRow.path("firstPageId").isNull()).isTrue();
        assertThat(ownerRow.path("permissions").path("canTrash").asBoolean()).isTrue();
        assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        String output=System.getenv("DIO_DIARY_CONTRACT_OUTPUT");
        if(output!=null)java.nio.file.Files.writeString(java.nio.file.Path.of(output), json.writeValueAsString(Map.of("detail",json.readTree(response.body()),"list",json.readTree(get("",token).body()),"trash",json.readTree(get("?status=trashed",token).body()))));
    }
    @Test void ownerTrashPreservesMembershipAndComputesThirtyDayRestoreBoundary() throws Exception {
        var items=json.readTree(get("?status=trashed",token).body()).path("items"); assertThat(items.size()).isEqualTo(2);
        for(var row:items){
            assertThat(Instant.parse(row.path("expiresAt").asText())).isEqualTo(Instant.parse(row.path("deletedAt").asText()).plusSeconds(30*86400L));
            assertThat(row.path("permissions").path("canRestore").asBoolean()).isEqualTo(row.path("diaryId").asText().equals(id(4).toString()));
            assertThat(row.path("permissions").path("canEditCanvas").asBoolean()).isFalse();
        }
        assertThat(json.readTree(get("?status=trashed",editorToken).body()).path("items").size()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from diary_members where diary_id=?",Long.class,id(4))).isEqualTo(1L);
    }
    @Test void paginatesEverySortWithoutDuplicatesAndBindsCursorToAccountAndQuery() throws Exception {
        for(String sort:List.of("updatedAtDesc","createdAtDesc","titleAsc","pageCountDesc")){
            var seen=new HashSet<String>(); String cursor=null; int pages=0;
            do {
                var r=get("?limit=1&sort="+sort+(cursor==null?"":"&cursor="+cursor),token); assertThat(r.statusCode()).isEqualTo(200);
                var page=json.readTree(r.body()); assertThat(seen.add(page.path("items").get(0).path("diaryId").asText())).isTrue();
                cursor=page.path("hasNext").asBoolean()?page.path("nextCursor").asText():null;
                if(cursor!=null){
                    assertThat(get("?sort="+sort+"&cursor="+cursor,editorToken).statusCode()).isEqualTo(400);
                    assertThat(get("?sort="+sort+"&filter=shared&cursor="+cursor,token).statusCode()).isEqualTo(400);
                }
                assertThat(++pages).isLessThanOrEqualTo(5);
            }while(cursor!=null);
            assertThat(seen).hasSize(5);
        }
    }
    @Test void validatesQueryAndEscapesLiteralWildcards() throws Exception {
        for(String query:List.of("?limit=0","?limit=101","?limit=x","?cursor=bad","?status=no","?filter=no","?sort=no","?q=%0A","/not-a-uuid"))
            assertThat(get(query,token).statusCode()).as(query).isEqualTo(400);
        assertThat(json.readTree(get("?q=%25_",token).body()).path("items").size()).isEqualTo(1);
        assertThat(json.readTree(get("?favorite=true",token).body()).path("items").size()).isEqualTo(1);
        assertThat(json.readTree(get("?filter=personal",token).body()).path("items").size()).isEqualTo(1);
        assertThat(json.readTree(get("?filter=shared",token).body()).path("items").size()).isEqualTo(4);
    }
    @Test void blocksLegacyUnauthenticatedWritesUntilTheirOwnershipContractIsImplemented() throws Exception {
        for(String method:List.of("DELETE")){
            String path="/api/v1/diaries"+(method.equals("POST")?"":"/"+id(1)+"?permanent=true");
            var r=request(method,path,token,null); assertThat(r.statusCode()).isEqualTo(409);assertThat(r.body()).contains("DIARY_NOT_TRASHED");
            assertThat(request(method,path,null,null).statusCode()).isEqualTo(401);
        }
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(8L);
    }
    @Test void restrictsCorsAndDocumentsReadSecurity() throws Exception {
        var allowed=request("OPTIONS","/api/v1/diaries",null,null,"Origin","http://localhost:8081","Access-Control-Request-Method","GET","Access-Control-Request-Headers","Authorization");
        assertThat(allowed.statusCode()).isEqualTo(200);
        assertThat(request("OPTIONS","/api/v1/diaries",null,null,"Origin","https://untrusted.example","Access-Control-Request-Method","GET").statusCode()).isEqualTo(403);
        var api=json.readTree(request("GET","/v3/api-docs",null,null).body());
        assertThat(api.path("paths").path("/api/v1/diaries").path("get").path("security").get(0).has("bearerAuth")).isTrue();
        assertThat(api.path("components").path("schemas").path("DiaryReadItem").path("required").size()).isEqualTo(15);
        assertThat(api.path("components").path("schemas").path("DiaryReadItem").path("properties").path("firstPageId").path("type").toString()).contains("null");
    }
}
