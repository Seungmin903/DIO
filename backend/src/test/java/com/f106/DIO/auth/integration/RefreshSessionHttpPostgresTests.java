package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.support.LoginSecrets;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.*;
import static org.assertj.core.api.Assertions.*;

/** Real TCP HTTP, production Flyway schema, explicit disposable PostgreSQL only. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={
    "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
    "dio.auth.session-cleanup.enabled=false", "dio.moderation.report-mail.enabled=false"})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="DIO_AUTH_SCHEMA_TEST", matches="true")
class RefreshSessionHttpPostgresTests {
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        String url=System.getenv("DIO_AUTH_SCHEMA_TEST_URL");
        if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/auth_ci"))
            throw new IllegalStateException("Explicit disposable loopback auth_ci required");
        r.add("spring.datasource.url",()->url);
        r.add("spring.datasource.username",()->"postgres");
        r.add("spring.datasource.password",()->System.getenv("DIO_AUTH_SCHEMA_TEST_PASSWORD"));
        EmailLoginTests.temporaryJwtKey(r);
    }
    @LocalServerPort int port;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired RefreshTokenRepository tokens;
    @Autowired PlatformTransactionManager transactions;
    @Autowired @Qualifier("authPasswordEncoder") org.springframework.security.crypto.password.PasswordEncoder passwords;
    @MockitoBean com.f106.DIO.auth.infrastructure.mail.SignupMailSender signupMail;
    @MockitoBean com.f106.DIO.auth.infrastructure.mail.PasswordResetMailSender resetMail;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final List<Long> fixtureUsers=new ArrayList<>();
    @org.junit.jupiter.api.AfterEach void removeFixtures() {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            for(Long id:fixtureUsers) { jdbc.update("delete from user_auth_accounts where user_id=?",id); jdbc.update("delete from users where user_id=?",id); }
        });
    }
    record Session(long userId,long tokenId,String access,String refresh) {}
    record Reply(int status,JsonNode body,HttpHeaders headers) {}
    private HttpRequest request(String path,Map<String,Object> body,String bearer) {
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/"+path)).timeout(Duration.ofSeconds(15))
            .header("Content-Type","application/json");
        if(bearer!=null)b.header("Authorization","Bearer "+bearer);
        return b.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
    }
    private Reply post(String path,Map<String,Object> body,String bearer) throws Exception {
        var response=client.send(request(path,body,bearer),HttpResponse.BodyHandlers.ofString());
        return new Reply(response.statusCode(),response.body().isBlank()?null:json.readTree(response.body()),response.headers());
    }
    private Session login() throws Exception {
        String email="http-refresh-"+UUID.randomUUID()+"@example.com";
        String password=UUID.randomUUID().toString().substring(0,20)+"aA1!";
        long id=new TransactionTemplate(transactions).execute(status->{
            var u=users.saveAndFlush(new User(email,"갱신검증",Instant.now()));
            accounts.saveAndFlush(new EmailAuthProvider(u.getUserId(),email,passwords.encode(password),Instant.now()));
            return u.getUserId();
        });
        fixtureUsers.add(id);
        var reply=post("auth/login",Map.of("email",email,"password",password),null);
        assertThat(reply.status).isEqualTo(200);
        String refresh=reply.body.path("refreshToken").asText();
        long token=tokens.findIdByTokenHash(LoginSecrets.hash(refresh)).orElseThrow();
        return new Session(id,token,reply.body.path("accessToken").asText(),refresh);
    }
    private Reply refresh(String token) throws Exception { return post("auth/refresh",Map.of("refreshToken",token),null); }
    private com.f106.DIO.auth.domain.RefreshToken row(Session s) { return tokens.findById(s.tokenId).orElseThrow(); }
    private void ageGrace(Session s) { jdbc.update("update refresh_token_history set rotated_at=? where token_id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(31)),s.tokenId); }
    private void unauthorized(Reply r) { assertThat(r.status).isEqualTo(401); assertThat(r.body.path("code").asText()).isEqualTo("INVALID_TOKEN"); }

    @Test void actualHttpRefreshExtendsThirtyDaysAndPersistsAcrossNewClient() throws Exception {
        var s=login();
        jdbc.update("update refresh_tokens set expires_at=? where token_id=?",java.sql.Timestamp.from(Instant.now().plusSeconds(300)),s.tokenId);
        Instant before=Instant.now();var r=refresh(s.refresh); Instant after=Instant.now();
        assertThat(r.status).isEqualTo(200);
        assertThat(r.headers.firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(row(s).getExpiresAt()).isBetween(before.plus(Duration.ofDays(30)),after.plus(Duration.ofDays(30)));
        assertThat(r.body.path("refreshExpiresIn").asLong()).isEqualTo(2592000);
        assertThat(r.body.path("refreshToken").asText()).isNotEqualTo(s.refresh);
        var nextClient=HttpClient.newHttpClient();
        var restored=nextClient.send(request("auth/refresh",Map.of("refreshToken",r.body.path("refreshToken").asText()),null),HttpResponse.BodyHandlers.ofString());
        assertThat(restored.statusCode()).isEqualTo(200);
        assertThat(json.readTree(restored.body()).path("user").path("userId").asText()).isEqualTo(Long.toString(s.userId));
    }
    @Test void actualHttpRenewalCannotExceedNinetyDaysAndAbsoluteExpiryRejects() throws Exception {
        var s=login();
        jdbc.update("update refresh_tokens set created_at=? where token_id=?",java.sql.Timestamp.from(Instant.now().minus(Duration.ofDays(89))),s.tokenId);
        Instant cap=row(s).getCreatedAt().plus(Duration.ofDays(90));
        var r=refresh(s.refresh);assertThat(r.status).isEqualTo(200);assertThat(row(s).getExpiresAt()).isEqualTo(cap);
        assertThat(r.body.path("refreshExpiresIn").asLong()).isBetween(86390L,86400L);
        jdbc.update("update refresh_tokens set created_at=? where token_id=?",java.sql.Timestamp.from(Instant.now().minus(Duration.ofDays(90)).minusSeconds(1)),s.tokenId);
        unauthorized(refresh(r.body.path("refreshToken").asText()));
    }
    @Test void lostHttpResponseBodyRecoversSameSuccessorWithoutSlidingGrace() throws Exception {
        var s=login();
        // The server commits before sending response headers. Fail the real client's body handler, retaining only A.
        assertThatThrownBy(()->client.send(request("auth/refresh",Map.of("refreshToken",s.refresh),null),info->{
            assertThat(info.statusCode()).isEqualTo(200);throw new IllegalStateException("Simulated response body loss");
        })).isInstanceOf(Exception.class);
        var committed=row(s);assertThat(committed.getTokenHash()).isNotEqualTo(LoginSecrets.hash(s.refresh));
        Instant rotated=jdbc.queryForObject("select rotated_at from refresh_token_history where token_id=? order by rotated_at desc limit 1",(rs,n)->rs.getTimestamp(1).toInstant(),s.tokenId);
        var retry=refresh(s.refresh);assertThat(retry.status).isEqualTo(200);
        String successor=retry.body.path("refreshToken").asText();
        assertThat(LoginSecrets.hash(successor)).isEqualTo(committed.getTokenHash());
        assertThat(refresh(successor).body.path("refreshToken").asText()).isEqualTo(successor);
        assertThat(row(s).getExpiresAt()).isEqualTo(committed.getExpiresAt());
        Instant retriedAt=jdbc.queryForObject("select max(rotated_at) from refresh_token_history where token_id=?",(rs,n)->rs.getTimestamp(1).toInstant(),s.tokenId);
        assertThat(retriedAt).isEqualTo(rotated);
        ageGrace(s);unauthorized(refresh(s.refresh));
        assertThat(row(s).getRevokedAt()).isNotNull();unauthorized(refresh(successor));
    }
    @Test void simultaneousHttpRequestsReturnOneSuccessor() throws Exception {
        var s=login();var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var start=new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.Callable<Reply> action=()->{start.await();return refresh(s.refresh);};
            var a=pool.submit(action);var b=pool.submit(action);start.countDown();
            var left=a.get(20,java.util.concurrent.TimeUnit.SECONDS);var right=b.get(20,java.util.concurrent.TimeUnit.SECONDS);
            assertThat(left.status).isEqualTo(200);assertThat(right.status).isEqualTo(200);
            assertThat(left.body.path("refreshToken").asText()).isEqualTo(right.body.path("refreshToken").asText());
            assertThat(row(s).getRevokedAt()).isNull();
            assertThat(jdbc.queryForObject("select count(*) from refresh_token_history where token_id=?",Long.class,s.tokenId)).isEqualTo(1);
        } finally {pool.shutdownNow();pool.awaitTermination(20,java.util.concurrent.TimeUnit.SECONDS);}
    }
    @Test void logoutAndIdleExpiryOverrideGraceOnActualHttp() throws Exception {
        var s=login();var r=refresh(s.refresh);
        assertThat(post("auth/logout",Map.of(),r.body.path("accessToken").asText()).status).isEqualTo(204);
        unauthorized(refresh(s.refresh));unauthorized(refresh(r.body.path("refreshToken").asText()));
        var idle=login();jdbc.update("update refresh_tokens set expires_at=? where token_id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(1)),idle.tokenId);
        unauthorized(refresh(idle.refresh));
    }
}
