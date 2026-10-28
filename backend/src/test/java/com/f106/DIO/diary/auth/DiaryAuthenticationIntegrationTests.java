package com.f106.DIO.diary.auth;

import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.repository.RefreshTokenHistoryRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.support.LoginSecrets;


import com.f106.DIO.auth.config.LoginProperties;
import com.f106.DIO.auth.service.EmailLoginService;
import org.springframework.test.util.ReflectionTestUtils;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import com.f106.DIO.diary.creation.*;
import com.f106.DIO.diary.detail.*;
import com.f106.DIO.diary.dto.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.*;

/** 실제 로그인 서명·세션 검증기·제품 JDBC 페이지 모듈과 트랜잭션 서비스 통합. HTTP 경로 테스트는 아니다. */
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:diary-auth-tests;MODE=PostgreSQL",
    "dio.auth.development-token-header=X-DIO-Access-Token"
})
@ActiveProfiles("test")
class DiaryAuthenticationIntegrationTests {
    @DynamicPropertySource static void signingKey(DynamicPropertyRegistry registry) {
        registry.add("dio.auth.jwt-secret", DiaryAuthenticationIntegrationTests::randomKey);
    }
    static String randomKey() {
        byte[] bytes = new byte[32];
        new java.security.SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired LoginJwt jwt;
    @Autowired LoginProperties properties;
    @Autowired RefreshTokenRepository sessions;
    @Autowired RefreshTokenHistoryRepository history;
    @Autowired EmailLoginService login;
    @Autowired MemberDiaryCreationService creation;
    @Autowired DiaryDetailService detail;
    @Autowired DiaryCreationIdentity creationIdentity;
    @Autowired DiaryDetailIdentity detailIdentity;
    RefreshToken ownerSession;
    RefreshToken otherSession;
    String ownerToken;
    String otherToken;

    @BeforeEach void fixtures() {
        RequestContextHolder.resetRequestAttributes();
        // JPA가 소유하지 않는 페이지·멤버십은 테스트 전용 최소 테이블로 준비한다.
        jdbc.execute("create table if not exists page_templates(template_id bigint primary key,code varchar(100),template_version varchar(30),orientation varchar(20),canvas_width decimal(10,2),canvas_height decimal(10,2),default_config jsonb,is_active boolean default true)");
        jdbc.execute("create table if not exists pages(page_id uuid primary key,diary_id uuid,template_id bigint,template_config jsonb,sort_key decimal(20,10),canvas_width decimal(10,2),canvas_height decimal(10,2),created_at timestamp(6) with time zone,updated_at timestamp(6) with time zone,deleted_at timestamp(6) with time zone)");
        jdbc.execute("create table if not exists diary_members(diary_id uuid,user_id bigint,role varchar(20),member_color char(7),joined_at timestamp(6) with time zone,left_at timestamp(6) with time zone,primary key(diary_id,user_id))");
        jdbc.update("delete from pages"); jdbc.update("delete from diary_members"); jdbc.update("delete from diaries");
        jdbc.update("delete from page_templates");
        jdbc.update("insert into page_templates(template_id,code,template_version,orientation,canvas_width,canvas_height) values(10,'TEST','1','LANDSCAPE',1024,768)");
        history.deleteAll(); sessions.deleteAll(); jdbc.update("delete from users");
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        for (long id : new long[] { 101, 202 }) {
            jdbc.update("insert into users(user_id,email,nickname,nickname_key,profile_color,status,created_at,updated_at) values (?,?,?,?,?,'ACTIVE',?,?)",
                id, id+"@example.com", "user"+id, "user"+id, "#123456", Timestamp.from(now), Timestamp.from(now));
        }
        ownerSession = session(101); otherSession = session(202);
        ownerToken = token(101, ownerSession.getSessionId(), now.plusSeconds(300));
        otherToken = token(202, otherSession.getSessionId(), now.plusSeconds(300));
    }
    @AfterEach void cleanup() { RequestContextHolder.resetRequestAttributes(); }
    RefreshToken session(long user) {
        return sessions.saveAndFlush(new RefreshToken(user, LoginSecrets.hash(UUID.randomUUID().toString()),
            "test", Instant.now(), Instant.now().plusSeconds(600)));
    }
    String token(long user, UUID sessionId, Instant expiry) {
        return jwt.issue(user, sessionId, Instant.now().minusSeconds(10), expiry);
    }
    MockHttpServletRequest request(String access) {
        var request = new MockHttpServletRequest();
        if (access != null) request.addHeader("Authorization", "Bearer " + access);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        return request;
    }
    MemberDiaryCreationService.Created create() {
        return creation.create(new DiaryCreateRequest("diary",null,null,null), List.of(new DiaryInitialPages.Selection("TEST","1","{}")));
    }
    void bothReject() {
        assertThatThrownBy(creationIdentity::requireUserId).isInstanceOfSatisfying(DiaryCreationException.class,
            e -> assertThat(e.status().value()).isEqualTo(401));
        assertThatThrownBy(detailIdentity::requireUserId).isInstanceOfSatisfying(DiaryDetailException.class,
            e -> assertThat(e.status().value()).isEqualTo(401));
    }

    @Test void verifiedOwnerCreatesReadsAndUpdatesUsingTheSameAuthenticatedUser() {
        var request = request(ownerToken);
        request.addHeader("X-User-Id", "202"); request.addParameter("ownerUserId", "202");
        var created = create();
        UUID id = UUID.fromString(created.diary().diaryId());
        assertThat(jdbc.queryForObject("select owner_user_id from diaries where diary_id=?",Long.class,id)).isEqualTo(101);
        assertThat(jdbc.queryForObject("select user_id from diary_members where diary_id=?",Long.class,id)).isEqualTo(101);
        assertThat(detail.get(id).diary().diaryTitle()).isEqualTo("diary");
        var patch = new DiaryUpdateRequest(); patch.setDiaryTitle("updated");
        assertThat(detail.update(id,patch,created.diary().updatedAt()).diary().diaryTitle()).isEqualTo("updated");
    }

    @Test void authenticatedNonMembersCannotReadOrUpdateAnotherUsersDiary() {
        request(ownerToken); var created = create(); UUID id = UUID.fromString(created.diary().diaryId());
        request(otherToken);
        assertThat(creationIdentity.requireUserId()).isEqualTo(202);
        assertThatThrownBy(() -> detail.get(id)).isInstanceOfSatisfying(DiaryDetailException.class,
            e -> assertThat(e.status().value()).isEqualTo(404));
        var patch = new DiaryUpdateRequest(); patch.setDiaryTitle("attack");
        assertThatThrownBy(() -> detail.update(id,patch,created.diary().updatedAt())).isInstanceOfSatisfying(DiaryDetailException.class,
            e -> assertThat(e.status().value()).isEqualTo(404));
        assertThat(jdbc.queryForObject("select title from diaries where diary_id=?",String.class,id)).isEqualTo("diary");
    }

    @Test void viewerCannotReadOrModifyMetadata() {
        request(ownerToken); var created = create(); UUID id = UUID.fromString(created.diary().diaryId());
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,joined_at) values (?,202,'VIEWER','#123456',?)",id,Timestamp.from(Instant.now()));
        request(otherToken); assertThatThrownBy(() -> detail.get(id)).isInstanceOfSatisfying(DiaryDetailException.class,e -> assertThat(e.status().value()).isEqualTo(404));
        var patch = new DiaryUpdateRequest(); patch.setDiaryTitle("attack");
        assertThatThrownBy(() -> detail.update(id,patch,created.diary().updatedAt())).isInstanceOfSatisfying(DiaryDetailException.class,
            e -> assertThat(e.status().value()).isEqualTo(404));
    }

    @Test void absentMalformedExpiredTamperedAndForeignSignedTokensAreRejected() {
        bothReject(); request(null); bothReject();
        var request = request(null); request.addHeader("Authorization", "Bearer a b"); bothReject();
        request("not.a.jwt"); bothReject();
        request(token(101,ownerSession.getSessionId(),Instant.now().minusSeconds(1))); bothReject();
        String changed = ownerToken.substring(0,ownerToken.lastIndexOf('.')+1)+"AAAA";
        request(changed); bothReject();
        var foreign = new LoginJwt(new LoginProperties(randomKey(),900,2592000));
        request(foreign.issue(101L,ownerSession.getSessionId(),Instant.now(),Instant.now().plusSeconds(300))); bothReject();
        assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isZero();
    }

    @Test void logoutRevokesBothAdaptersWithoutCachingWhileOtherDeviceSurvives() {
        request(ownerToken); assertThat(creationIdentity.requireUserId()).isEqualTo(101);
        var second = session(101); String secondToken = token(101,second.getSessionId(),Instant.now().plusSeconds(300));
        login.logout(jwt.decode(ownerToken)); bothReject();
        request(secondToken); assertThat(detailIdentity.requireUserId()).isEqualTo(101);
    }

    @Test void expiredMissingAndMismatchedSessionsAreRejected() {
        ReflectionTestUtils.setField(ownerSession, "expiresAt", Instant.now().minusSeconds(1)); sessions.saveAndFlush(ownerSession);
        request(ownerToken); bothReject();
        request(token(101,UUID.randomUUID(),Instant.now().plusSeconds(300))); bothReject();
        request(token(101,otherSession.getSessionId(),Instant.now().plusSeconds(300))); bothReject();
    }

    @Test void inactiveDeletedAndMissingUsersAreRejected() {
        request(ownerToken); jdbc.update("update users set status='SUSPENDED' where user_id=101"); bothReject();
        jdbc.update("update users set status='ACTIVE',deleted_at=? where user_id=101",Timestamp.from(Instant.now())); bothReject();
        jdbc.update("delete from users where user_id=101"); bothReject();
    }

    @Test void issuerAudienceAndAccessTokenPurposeAreValidatedEvenWithACorrectSignature() {
        var key = new javax.crypto.spec.SecretKeySpec(Base64.getDecoder().decode(properties.secret()), "HmacSHA256");
        var encoder = new org.springframework.security.oauth2.jwt.NimbusJwtEncoder(
            new com.nimbusds.jose.jwk.source.ImmutableSecret<com.nimbusds.jose.proc.SecurityContext>(key));
        for (String invalid : List.of("issuer", "audience", "purpose")) {
            var claims = org.springframework.security.oauth2.jwt.JwtClaimsSet.builder()
                .issuer(invalid.equals("issuer") ? "other" : "dio")
                .audience(List.of(invalid.equals("audience") ? "other-api" : "dio-api"))
                .subject("101").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300))
                .claim("sid", ownerSession.getSessionId().toString())
                .claim("token_use", invalid.equals("purpose") ? "refresh" : "access").build();
            var header = org.springframework.security.oauth2.jwt.JwsHeader.with(
                org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).type("JWT").build();
            request(encoder.encode(org.springframework.security.oauth2.jwt.JwtEncoderParameters.from(header,claims)).getTokenValue());
            bothReject();
        }
    }

    @Test void configuredDevelopmentHeaderUsesTheSameValidationAndAuthorizationTakesPrecedence() {
        var request = request(null); request.addHeader("Authorization", "Basic Zm9vOmJhcg==");
        request.addHeader("X-DIO-Access-Token", ownerToken);
        assertThat(detailIdentity.requireUserId()).isEqualTo(101);
        request = request(otherToken); request.addHeader("X-DIO-Access-Token", ownerToken);
        assertThat(detailIdentity.requireUserId()).isEqualTo(202);
        request = request("not.a.jwt"); request.addHeader("X-DIO-Access-Token", ownerToken); bothReject();
        request = request(null); request.addHeader("X-DIO-Access-Token", "not.a.jwt"); bothReject();
    }

    @Test void changingRequestsOrClearingTheRequestDoesNotLeakIdentity() {
        request(ownerToken); assertThat(creationIdentity.requireUserId()).isEqualTo(101);
        request(otherToken); assertThat(creationIdentity.requireUserId()).isEqualTo(202);
        RequestContextHolder.resetRequestAttributes(); bothReject();
    }

}
