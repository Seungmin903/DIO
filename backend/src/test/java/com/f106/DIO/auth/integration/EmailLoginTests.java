package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.dto.EmailVerificationRequest;
import com.f106.DIO.auth.dto.LoginRequest;
import com.f106.DIO.auth.dto.LoginResponse;
import com.f106.DIO.auth.dto.SignupRequest;

import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.domain.RefreshTokenHistory;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.infrastructure.mail.SignupMailSender;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.repository.EmailVerificationRepository;
import com.f106.DIO.auth.repository.RefreshTokenHistoryRepository;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.service.EmailLoginService;
import com.f106.DIO.auth.service.EmailSignupService;
import com.f106.DIO.auth.service.EmailVerificationService;
import com.f106.DIO.auth.service.ExpiredLoginSessionCleanup;
import com.f106.DIO.auth.support.LoginSecrets;
import com.f106.DIO.auth.support.LoginThrottle;
import com.f106.DIO.user.domain.TermsType;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.dto.Agreement;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.repository.TermsAgreementRepository;
import com.f106.DIO.user.repository.UserRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.test.context.jdbc.Sql("/push-session-h2.sql")
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:login-tests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.signup.verification-secret=testing-only-secret-at-least-32-bytes-long"
})
@AutoConfigureMockMvc @ActiveProfiles("test")
class EmailLoginTests {
    @DynamicPropertySource
    static void temporaryJwtKey(DynamicPropertyRegistry registry) {
        // 테스트 컨텍스트 전용 키이며 코드나 파일에 고정 자격 증명을 보관하지 않는다.
        byte[] bytes = new byte[32];
        new java.security.SecureRandom().nextBytes(bytes);
        String key = java.util.Base64.getEncoder().encodeToString(bytes);
        registry.add("dio.auth.jwt-secret", () -> key);
    }
    static final String EMAIL = "member@example.com";
    @Autowired MockMvc mvc;
    @Autowired EmailLoginService service;
    @Autowired LoginJwt jwt;
    @Autowired EmailSignupService signup;
    @Autowired EmailVerificationService verification;
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired TermsAgreementRepository agreements;
    @Autowired ProfilePhotoRepository photos;
    @Autowired EmailVerificationRepository verifications;
    @Autowired RefreshTokenRepository tokens;
    @MockitoSpyBean RefreshTokenHistoryRepository history;
    @Autowired ExpiredLoginSessionCleanup sessionCleanup;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @MockitoBean SignupMailSender mail;
    @MockitoBean LoginThrottle throttle;
    AtomicReference<String> code;

    @BeforeEach void setup() {
        reset(history);
        history.deleteAll(); tokens.deleteAll(); photos.deleteAll(); agreements.deleteAll();
        accounts.deleteAll(); users.deleteAll(); verifications.deleteAll(); reset(mail, throttle);
        code = new AtomicReference<>();
        doAnswer(invocation -> { code.set(invocation.getArgument(1)); return null; }).when(mail).send(anyString(), anyString());
    }
    void register() {
        verification.send(EMAIL);
        String token = verification.verify(new EmailVerificationRequest(EMAIL, code.get())).signupToken();
        signup.signup(new SignupRequest(EMAIL, token, "DioMember123!", "디오사용자",
            List.of(new Agreement(TermsType.SERVICE, "v2", true),
                new Agreement(TermsType.PRIVACY, "v2", true)), true));
    }
    LoginResponse login() { return service.login(new LoginRequest(EMAIL, "DioMember123!", "휴대폰"), "127.0.0.1"); }
    @Test void passwordChangeRequiresAuthenticationAndRejectsWrongCurrentPassword()throws Exception{
        register();var login=login();
        String body="{\"currentPassword\":\"wrong\",\"newPassword\":\"ChangedDio123!\"}";
        mvc.perform(patch("/api/v1/me/password").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/v1/me/password").header("Authorization","Bearer "+login.accessToken()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CURRENT_PASSWORD_MISMATCH"));
        assertThat(service.active(jwt.decode(login.accessToken()))).isTrue();
        assertThat(login()).isNotNull();
    }
    @Test void passwordChangeRevokesAllSessionsAndRequiresTheNewPassword()throws Exception{
        register();var first=login();var second=login();
        mvc.perform(patch("/api/v1/me/password").header("Authorization","Bearer "+first.accessToken()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"currentPassword\":\"DioMember123!\",\"newPassword\":\"ChangedDio123!\"}"))
            .andExpect(status().isNoContent()).andExpect(content().string(""));
        assertThat(service.active(jwt.decode(first.accessToken()))).isFalse();
        assertThat(service.active(jwt.decode(second.accessToken()))).isFalse();
        assertThatThrownBy(this::login).isInstanceOf(LoginException.class);
        assertThat(service.login(new LoginRequest(EMAIL,"ChangedDio123!","phone"),"127.0.0.1")).isNotNull();
        mvc.perform(patch("/api/v1/me/password").header("Authorization","Bearer "+first.accessToken()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
    }
    @Test void passwordChangeRejectsSameOrMalformedPasswordWithoutRevokingSession()throws Exception{
        register();var login=login();
        for(String next:List.of("DioMember123!","short","abcdefgh","한글12345678"))
            mvc.perform(patch("/api/v1/me/password").header("Authorization","Bearer "+login.accessToken()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"DioMember123!\",\"newPassword\":\""+next+"\"}"))
                .andExpect(status().isBadRequest());
        assertThat(service.active(jwt.decode(login.accessToken()))).isTrue();
        assertThat(login()).isNotNull();
    }
    @Test void myProfileRequiresAuthenticationAndReturnsTokenUser()throws Exception{
        register();var login=login();
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+login.accessToken()))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.userId").value(login.user().userId()))
            .andExpect(jsonPath("$.email").value(EMAIL))
            .andExpect(jsonPath("$.nickname").value("디오사용자"))
            .andExpect(jsonPath("$.profilePhotoUrl").value(org.hamcrest.Matchers.nullValue()));
        service.logout(jwt.decode(login.accessToken()));
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+login.accessToken())).andExpect(status().isUnauthorized());
    }
    @Test void myNicknameChangeNormalizesAndAllowsDuplicates()throws Exception{
        register();var login=login();
        Long otherId=users.saveAndFlush(new User("other@example.com","새닉네임",Instant.now())).getUserId();
        mvc.perform(patch("/api/v1/me").header("Authorization","Bearer "+login.accessToken()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nickname\":\"  새닉네임 \"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value(login.user().userId()))
            .andExpect(jsonPath("$.email").value(EMAIL))
            .andExpect(jsonPath("$.nickname").value("새닉네임"));
        var saved=users.findById(Long.valueOf(login.user().userId())).orElseThrow();
        assertThat(saved.getNickname()).isEqualTo("새닉네임");
        assertThat(saved.getNicknameKey()).isEqualTo("새닉네임");
        assertThat(users.findById(otherId).orElseThrow().getNickname()).isEqualTo("새닉네임");
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+login.accessToken()))
            .andExpect(jsonPath("$.nickname").value("새닉네임"));
    }
    @Test void myProfileAllowsWebPreflightForPatch()throws Exception{
        mvc.perform(options("/api/v1/me").header("Origin","http://localhost:8081").header("Access-Control-Request-Method","PATCH")
                .header("Access-Control-Request-Headers","Authorization,Content-Type"))
            .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:8081"));
    }
    @Test void myNicknameChangeRejectsMalformedNicknameAndMissingToken()throws Exception{
        register();var login=login();
        for(String body:List.of("{}","{\"nickname\":\"\"}","{\"nickname\":\"a\"}","{\"nickname\":\"열두글자를넘는아주긴닉네임\"}","{\"nickname\":\"공백 포함\"}","{\"nickname\":\"이모지😀\"}"))
            mvc.perform(patch("/api/v1/me").header("Authorization","Bearer "+login.accessToken()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/me").contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"새닉네임\"}"))
            .andExpect(status().isUnauthorized());
        assertThat(users.findAll().get(0).getNickname()).isEqualTo("디오사용자");
    }
    @Test void inactiveUserCannotReadOrChangeProfile()throws Exception{
        register();var login=login();
        var user=users.findAll().get(0);ReflectionTestUtils.setField(user,"status","WITHDRAWN");users.saveAndFlush(user);
        mvc.perform(get("/api/v1/me").header("Authorization","Bearer "+login.accessToken())).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/v1/me").header("Authorization","Bearer "+login.accessToken()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"nickname\":\"새닉네임\"}")).andExpect(status().isUnauthorized());
    }
    @Test void socialOnlyAccountCannotChangeEmailPassword()throws Exception{
        register();var login=login();accounts.deleteAll();
        mvc.perform(patch("/api/v1/me/password").header("Authorization","Bearer "+login.accessToken()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"currentPassword\":\"DioMember123!\",\"newPassword\":\"ChangedDio123!\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("EMAIL_PASSWORD_REQUIRED"));
    }
    @Test void cleanupOnlyRemovesExpiredSessionsAndTheirHistory() {
        register();
        var expiredResponse = login(); var activeResponse = login(); var revokedResponse = login();
        var expired = tokens.findBySessionId(UUID.fromString(jwt.decode(expiredResponse.accessToken()).getClaimAsString("sid"))).orElseThrow();
        var active = tokens.findBySessionId(UUID.fromString(jwt.decode(activeResponse.accessToken()).getClaimAsString("sid"))).orElseThrow();
        var revoked = tokens.findBySessionId(UUID.fromString(jwt.decode(revokedResponse.accessToken()).getClaimAsString("sid"))).orElseThrow();
        org.springframework.test.util.ReflectionTestUtils.setField(expired, "expiresAt", Instant.now().minusSeconds(1)); tokens.saveAndFlush(expired);
        org.springframework.test.util.ReflectionTestUtils.setField(revoked, "revokedAt", Instant.now()); tokens.saveAndFlush(revoked);
        history.saveAllAndFlush(List.of(new RefreshTokenHistory(expired, Instant.now()), new RefreshTokenHistory(active, Instant.now()), new RefreshTokenHistory(revoked, Instant.now())));
        assertThat(sessionCleanup.purgeExpired()).isEqualTo(1);
        assertThat(tokens.findById(expired.getTokenId())).isEmpty();
        assertThat(history.existsById(expired.getTokenHash())).isFalse();
        assertThat(tokens.count()).isEqualTo(2);
        assertThat(history.count()).isEqualTo(2);
        assertThat(service.refresh(activeResponse.refreshToken()).accessToken()).isNotBlank();
        assertThatThrownBy(() -> service.refresh(revokedResponse.refreshToken())).isInstanceOf(LoginException.class);
        assertThat(sessionCleanup.purgeExpired()).isZero();
    }
    @Test void cleanupIsBoundedAndCanContinueInNextBatch() {
        register(); Long userId = users.findAll().get(0).getUserId();
        var expired = new java.util.ArrayList<RefreshToken>();
        for (int i = 0; i < 501; i++) expired.add(new RefreshToken(userId, LoginSecrets.hash("expired-" + i), null,
            Instant.now().minusSeconds(100), Instant.now().minusSeconds(1)));
        tokens.saveAllAndFlush(expired);
        assertThat(sessionCleanup.purgeExpired()).isEqualTo(500);
        assertThat(tokens.count()).isEqualTo(1);
        assertThat(sessionCleanup.purgeExpired()).isEqualTo(1);
        assertThat(sessionCleanup.purgeExpired()).isZero();
    }
    @Test void cleanupFailureRollsBackSessionAndHistoryDeletesTogether() {
        register(); Long userId = users.findAll().get(0).getUserId(); Instant now = Instant.now();
        var first = tokens.saveAndFlush(new RefreshToken(userId, LoginSecrets.hash("expired-first"), null, now.minusSeconds(10), now.minusSeconds(5)));
        var second = tokens.saveAndFlush(new RefreshToken(userId, LoginSecrets.hash("expired-second"), null, now.minusSeconds(10), now.minusSeconds(4)));
        history.saveAllAndFlush(List.of(new RefreshTokenHistory(first, now), new RefreshTokenHistory(second, now)));
        doThrow(new org.springframework.dao.DataAccessResourceFailureException("test cleanup failure"))
            .when(history).deleteForSession(second.getTokenId());
        assertThatThrownBy(() -> sessionCleanup.purgeExpired()).isInstanceOf(org.springframework.dao.DataAccessResourceFailureException.class);
        assertThat(tokens.count()).isEqualTo(2);
        assertThat(history.count()).isEqualTo(2);
    }
    @Test void authCorsAllowsLocalFrontendIncludingLogoutPreflightOnly() throws Exception {
        for (String path : List.of("login", "logout", "signup")) {
            mvc.perform(options("/api/v1/auth/" + path).header("Origin", "http://localhost:8081")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type,authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8081"));
        }
        mvc.perform(options("/api/v1/auth/login").header("Origin", "https://untrusted.example")
            .header("Access-Control-Request-Method", "POST")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/diaries").header("Origin", "http://localhost:8081"))
            .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
    @Test void loginNormalizesEmailReturnsTokensAndUpdatesLastLogin() throws Exception {
        register();
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\" MEMBER@example.com \",\"password\":\"DioMember123!\",\"deviceName\":\"휴대폰\"}"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.tokenType").value("Bearer")).andExpect(jsonPath("$.accessToken").isString())
            .andExpect(jsonPath("$.refreshToken").isString()).andExpect(jsonPath("$.expiresIn").value(900))
            .andExpect(jsonPath("$.user.email").value(EMAIL)).andExpect(jsonPath("$.user.nickname").value("디오사용자"))
            .andExpect(jsonPath("$.user.profileColor").doesNotExist()).andExpect(jsonPath("$.password").doesNotExist());
        assertThat(tokens.count()).isEqualTo(1);
        assertThat(ReflectionTestUtils.getField(users.findAll().get(0), "lastLoginAt")).isNotNull();
    }
    @Test void refreshTokenIsHashedAndAccessContainsNoEmail() {
        register(); var response = login(); var session = tokens.findAll().get(0);
        assertThat(session.getTokenHash()).isEqualTo(LoginSecrets.hash(response.refreshToken())).isNotEqualTo(response.refreshToken());
        var decoded = jwt.decode(response.accessToken());
        assertThat(decoded.getSubject()).isEqualTo(response.user().userId());
        assertThat(decoded.getClaimAsString("email")).isNull(); assertThat(decoded.getClaimAsString("password")).isNull();
        assertThat(response.toString()).doesNotContain(response.accessToken(), response.refreshToken());
    }
    @Test void bcryptRunsWithoutTransactionAndSessionWriteUsesTransaction() {
        register();
        Object original = ReflectionTestUtils.getField(service, "passwords");
        var verifier = spy((org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder)original);
        doAnswer(invocation -> {
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return invocation.callRealMethod();
        }).when(verifier).matches(any(), anyString());
        ReflectionTestUtils.setField(service, "passwords", verifier);
        try {
            assertThat(login().accessToken()).isNotBlank();
            assertThat(tokens.count()).isEqualTo(1);
            assertThat(ReflectionTestUtils.getField(users.findAll().get(0), "lastLoginAt")).isNotNull();
        } finally { ReflectionTestUtils.setField(service, "passwords", original); }
    }
    @Test void enclosingTransactionCannotKeepConnectionDuringLogin() {
        var transaction = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> transaction.execute(status -> login()))
            .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
        assertThat(tokens.count()).isZero();
    }
    @Test void passwordChangedDuringVerificationCannotIssueSessionWithOldPassword() {
        register();
        Object original = ReflectionTestUtils.getField(service, "passwords");
        var verifier = spy((org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder)original);
        doAnswer(invocation -> {
            boolean matches = (Boolean)invocation.callRealMethod();
            var account = accounts.findByProviderAndProviderUserId("EMAIL", EMAIL).orElseThrow();
            ReflectionTestUtils.setField(account, "passwordHash", "changed-after-verification");
            accounts.saveAndFlush(account);
            return matches;
        }).when(verifier).matches(any(), anyString());
        ReflectionTestUtils.setField(service, "passwords", verifier);
        try {
            assertThatThrownBy(this::login).isInstanceOfSatisfying(LoginException.class,
                error -> assertThat(error.code).isEqualTo("INVALID_CREDENTIALS"));
            assertThat(tokens.count()).isZero();
            assertThat(ReflectionTestUtils.getField(users.findAll().get(0), "lastLoginAt")).isNull();
        } finally { ReflectionTestUtils.setField(service, "passwords", original); }
    }
    @Test void wrongUnknownAndInactiveAccountsReturnSameError() throws Exception {
        register();
        for (String email : List.of(EMAIL, "unknown@example.com")) {
            mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"WrongPass123!\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        }
        User user = users.findAll().get(0); ReflectionTestUtils.setField(user, "status", "SUSPENDED"); users.saveAndFlush(user);
        assertThatThrownBy(this::login).isInstanceOfSatisfying(LoginException.class, e -> assertThat(e.code).isEqualTo("INVALID_CREDENTIALS"));
        assertThat(tokens.count()).isZero(); assertThat(ReflectionTestUtils.getField(users.findAll().get(0), "lastLoginAt")).isNull();
    }
    @Test void inputValidationAndRateLimitAreExposedWithoutIssuingSessions() throws Exception {
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"invalid\",\"password\":\"short\"}"))
            .andExpect(status().isBadRequest());
        doThrow(new LoginException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS, "LOGIN_RATE_LIMITED", "제한"))
            .when(throttle).reserve(anyString(), anyString());
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"member@example.com\",\"password\":\"DioMember123!\"}"))
            .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "900"));
        assertThat(tokens.count()).isZero();
    }
    @Test void refreshRotatesTokenAndPreservesAbsoluteSessionExpiry() throws Exception {
        register(); var first = login(); Instant originalExpiry = tokens.findAll().get(0).getExpiresAt();
        mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
            .content("{\"refreshToken\":\"" + first.refreshToken() + "\"}"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.accessToken").isString()).andExpect(jsonPath("$.refreshToken").value(org.hamcrest.Matchers.not(first.refreshToken())));
        assertThat(history.count()).isEqualTo(1); assertThat(tokens.count()).isEqualTo(1);
        assertThat(tokens.findAll().get(0).getExpiresAt()).isEqualTo(originalExpiry);
    }
    @Test void reusedRefreshRevokesSessionAndRevocationSurvivesError() throws Exception {
        register(); var first = login(); var next = service.refresh(first.refreshToken());
        assertThatThrownBy(() -> service.refresh(first.refreshToken())).isInstanceOf(LoginException.class);
        assertThat(tokens.findAll().get(0).getRevokedAt()).isNotNull();
        assertThatThrownBy(() -> service.refresh(next.refreshToken())).isInstanceOf(LoginException.class);
        mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + next.accessToken()))
            .andExpect(status().isUnauthorized());
    }
    @Test void logoutInvalidatesOnlyCurrentDevice() throws Exception {
        register(); var first = login(); var second = login();
        mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + first.accessToken()))
            .andExpect(status().isNoContent());
        assertThatThrownBy(() -> service.refresh(first.refreshToken())).isInstanceOf(LoginException.class);
        assertThat(service.refresh(second.refreshToken()).accessToken()).isNotBlank();
        mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + first.accessToken()))
            .andExpect(status().isUnauthorized());
    }
    @Test void logoutRejectsMissingTamperedExpiredAndRefreshTokens() throws Exception {
        register(); var response = login(); var decoded = jwt.decode(response.accessToken());
        String[] parts = response.accessToken().split("\\.");
        String tampered = parts[0] + "." + parts[1] + "." + (parts[2].startsWith("a") ? "b" : "a") + parts[2].substring(1);
        String expired = jwt.issue(Long.valueOf(decoded.getSubject()), UUID.fromString(decoded.getClaimAsString("sid")),
            Instant.now().minusSeconds(180), Instant.now().minusSeconds(60));
        mvc.perform(post("/api/v1/auth/logout")).andExpect(status().isUnauthorized());
        for (String token : List.of(tampered, expired, response.refreshToken())) {
            mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        }
    }
    @Test void expiredOrUnknownRefreshDoesNotCreateSession() {
        register(); var response = login(); var session = tokens.findAll().get(0);
        org.springframework.test.util.ReflectionTestUtils.setField(session, "expiresAt", Instant.now().minusSeconds(1)); tokens.saveAndFlush(session);
        assertThatThrownBy(() -> service.refresh(response.refreshToken())).isInstanceOf(LoginException.class);
        assertThatThrownBy(() -> service.refresh(LoginSecrets.refresh())).isInstanceOf(LoginException.class);
        assertThat(tokens.count()).isEqualTo(1);
    }
    @Test void disabledUserCannotRefreshOrUseAccessToken() throws Exception {
        register(); var response = login(); User user = users.findAll().get(0);
        ReflectionTestUtils.setField(user, "deletedAt", Instant.now()); users.saveAndFlush(user);
        mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + response.accessToken()))
            .andExpect(status().isUnauthorized());
        assertThatThrownBy(() -> service.refresh(response.refreshToken())).isInstanceOf(LoginException.class);
        assertThat(tokens.findAll().get(0).getRevokedAt()).isNotNull();
    }
    @Test void concurrentRefreshCannotCreateTwoValidDescendants() throws Exception {
        register(); var first = login();
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var start = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.Callable<Boolean> refresh = () -> {
                start.await();
                try { service.refresh(first.refreshToken()); return true; }
                catch (LoginException expected) { return false; }
            };
            var a = pool.submit(refresh); var b = pool.submit(refresh); start.countDown();
            assertThat(List.of(a.get(20, java.util.concurrent.TimeUnit.SECONDS), b.get(20, java.util.concurrent.TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(true, false);
            assertThat(tokens.findAll().get(0).getRevokedAt()).isNotNull(); assertThat(history.count()).isEqualTo(1);
        } finally { pool.shutdownNow(); }
    }
    @Test void loginSwaggerRequiresBearerForLogoutAndSavedDiaryApis() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andExpect(jsonPath("$.paths['/api/v1/auth/login'].post").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/refresh'].post").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/logout'].post.security[0].bearerAuth").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/logout'].post.responses['204']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/logout'].post.responses['204'].content").doesNotExist())
            .andExpect(jsonPath("$.paths['/api/v1/auth/logout'].post.responses['200']").doesNotExist())
            .andExpect(jsonPath("$.paths['/api/v1/auth/login'].post.security").doesNotExist())
            .andExpect(jsonPath("$.paths['/api/v1/me'].get.security[0].bearerAuth").exists())
            .andExpect(jsonPath("$.paths['/api/v1/me'].patch.security[0].bearerAuth").exists())
			.andExpect(jsonPath("$.paths['/api/v1/diaries'].get.security[0].bearerAuth").exists());
    }
}
