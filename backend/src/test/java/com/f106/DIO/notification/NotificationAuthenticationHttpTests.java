package com.f106.DIO.notification;

import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.dto.LoginResponse;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import static org.assertj.core.api.Assertions.assertThat;

/** 실제 HTTP 로그인·JWT 필터·활성 세션·알림 SQL을 함께 검증한다. 공유 모듈은 미연결이다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:notification-auth-http;MODE=PostgreSQL",
    "dio.auth.session-cleanup.enabled=false"
})
class NotificationAuthenticationHttpTests {
    @DynamicPropertySource static void key(DynamicPropertyRegistry registry) {
        byte[] secret = new byte[32]; new java.security.SecureRandom().nextBytes(secret);
        String encoded = Base64.getEncoder().encodeToString(secret);
        registry.add("dio.auth.jwt-secret", () -> encoded);
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired LoginJwt jwt;
    final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
    final tools.jackson.databind.json.JsonMapper json = tools.jackson.databind.json.JsonMapper.builder().build();
    long firstId, secondId;
    @BeforeEach void fixtures() {
        jdbc.execute("create table if not exists notifications(notification_id bigint primary key,user_id bigint not null,actor_user_id bigint,diary_id uuid,page_id uuid,notification_type varchar(50),read_at timestamp(6) with time zone,deleted_at timestamp(6) with time zone,created_at timestamp(6) with time zone not null)");
        jdbc.update("delete from notifications"); jdbc.update("delete from refresh_token_history");
        jdbc.update("delete from refresh_tokens"); accounts.deleteAll(); users.deleteAll();
        firstId = user("first@example.com", "first"); secondId = user("second@example.com", "second");
        for (long id : new long[]{1001,1002,2001})
            jdbc.update("insert into notifications(notification_id,user_id,notification_type,created_at) values (?,?,?,?)",
                id, id == 2001 ? secondId : firstId, "DIARY_INVITE", java.sql.Timestamp.from(Instant.parse("2026-10-27T00:00:00.123456Z")));
    }
    long user(String email, String name) {
        var user = users.saveAndFlush(new User(email, name, Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(), email,
            new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4).encode("DioMember123!"), Instant.now()));
        return user.getUserId();
    }
    HttpResponse<String> request(String method, String path, String token, String body, String... headers) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        for (int i=0; i<headers.length; i+=2) builder.header(headers[i], headers[i+1]);
        return client.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    LoginResponse login(String email) throws Exception {
        var response = request("POST", "/api/v1/auth/login", null, "{\"email\":\""+email+"\",\"password\":\"DioMember123!\"}");
        assertThat(response.statusCode()).isEqualTo(200);
        return json.readValue(response.body(), LoginResponse.class);
    }
    @Test void actualLoginScopesAllFourApisAndCursorToTheRecipient() throws Exception {
        var first = login("first@example.com"); var second = login("second@example.com");
        var page = request("GET", "/api/v1/notifications?limit=1&userId="+secondId, first.accessToken(), null, "X-User-Id", Long.toString(secondId));
        assertThat(page.statusCode()).isEqualTo(200);
        var data = json.readTree(page.body());
        assertThat(data.path("items").get(0).path("notification").path("notificationId").asText()).isEqualTo("1002");
        assertThat(data.path("items").get(0).path("invitation").isNull()).isTrue();
        String cursor = data.path("nextCursor").asText();
        var next = request("GET", "/api/v1/notifications?limit=1&cursor="+cursor, first.accessToken(), null);
        assertThat(json.readTree(next.body()).path("items").get(0).path("notification").path("notificationId").asText()).isEqualTo("1001");
        assertThat(request("GET", "/api/v1/notifications?cursor="+cursor, second.accessToken(), null).statusCode()).isEqualTo(400);
        assertThat(request("GET", "/api/v1/notifications/unread-count", first.accessToken(), null).body()).contains("\"unreadCount\":2");
        assertThat(request("PATCH", "/api/v1/notifications/2001", first.accessToken(), null).statusCode()).isEqualTo(404);
        assertThat(request("DELETE", "/api/v1/notifications/2001", first.accessToken(), null).statusCode()).isEqualTo(404);
        assertThat(request("PATCH", "/api/v1/notifications/1001", first.accessToken(), null).statusCode()).isEqualTo(200);
        assertThat(request("DELETE", "/api/v1/notifications/1002", first.accessToken(), null).statusCode()).isEqualTo(204);
        assertThat(request("GET", "/api/v1/notifications/unread-count", second.accessToken(), null).body()).contains("\"unreadCount\":1");
    }
    @Test void rejectsMissingTamperedExpiredRefreshAndRevokedTokensWithoutHeaderBypass() throws Exception {
        var login = login("first@example.com"); var otherDevice = login("first@example.com");
        var decoded = jwt.decode(login.accessToken());
        String expired = jwt.issue(firstId, UUID.fromString(decoded.getClaimAsString("sid")), Instant.now().minusSeconds(120), Instant.now().minusSeconds(60));
        String mismatchedUser = jwt.issue(secondId, UUID.fromString(decoded.getClaimAsString("sid")), Instant.now(), Instant.now().plusSeconds(60));
        for (String token : new String[]{null, login.accessToken()+"x", expired, login.refreshToken(), mismatchedUser}) {
            for (String method : new String[]{"GET", "PATCH", "DELETE"}) {
                var response = request(method, method.equals("GET") ? "/api/v1/notifications" : "/api/v1/notifications/1001", token, null,
                    "X-User-Id", Long.toString(firstId));
                assertThat(response.statusCode()).isEqualTo(401);
                assertThat(response.body()).contains("AUTHENTICATION_REQUIRED");
                assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
            }
        }
        assertThat(request("POST", "/api/v1/auth/logout", login.accessToken(), null).statusCode()).isEqualTo(204);
        assertThat(request("GET", "/api/v1/notifications", login.accessToken(), null).statusCode()).isEqualTo(401);
        assertThat(request("GET", "/api/v1/notifications", otherDevice.accessToken(), null).statusCode()).isEqualTo(200);
        jdbc.update("update users set deleted_at=current_timestamp where user_id=?", firstId);
        assertThat(request("GET", "/api/v1/notifications", otherDevice.accessToken(), null).statusCode()).isEqualTo(401);
    }
    @Test void allowsOnlyConfiguredCorsOriginsAndDocumentsBearerSecurity() throws Exception {
        var allowed = request("OPTIONS", "/api/v1/notifications/1001", null, null, "Origin", "http://localhost:8081",
            "Access-Control-Request-Method", "DELETE", "Access-Control-Request-Headers", "Authorization");
        assertThat(allowed.statusCode()).isEqualTo(200);
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Origin").orElse("")).isEqualTo("http://localhost:8081");
        assertThat(request("OPTIONS", "/api/v1/notifications", null, null, "Origin", "https://untrusted.example",
            "Access-Control-Request-Method", "GET").statusCode()).isEqualTo(403);
        var api = json.readTree(request("GET", "/v3/api-docs", null, null).body());
        assertThat(api.path("paths").path("/api/v1/notifications").path("get").path("security").get(0).has("bearerAuth")).isTrue();
    }
}
