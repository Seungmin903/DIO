package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.dto.EmailVerificationRequest;
import com.f106.DIO.auth.dto.PasswordResetRequest;
import com.f106.DIO.auth.dto.PasswordResetVerificationRequest;
import com.f106.DIO.auth.dto.SignupRequest;
import com.f106.DIO.auth.exception.PasswordResetException;
import com.f106.DIO.auth.exception.SignupException;
import com.f106.DIO.auth.infrastructure.mail.PasswordResetMailSender;
import com.f106.DIO.auth.infrastructure.mail.SignupMailSender;
import com.f106.DIO.auth.repository.PasswordResetRepository;
import com.f106.DIO.auth.service.EmailSignupService;
import com.f106.DIO.auth.service.EmailVerificationService;
import com.f106.DIO.auth.service.LoginSessionRevoker;
import com.f106.DIO.auth.service.PasswordResetService;
import com.f106.DIO.auth.support.PasswordResetThrottle;
import com.f106.DIO.user.domain.TermsType;
import com.f106.DIO.user.dto.Agreement;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:reset-tests;MODE=PostgreSQL",
    "dio.signup.verification-secret=reset-test-only-secret-at-least-32-bytes"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class PasswordResetTests {
    static final String EMAIL="reset@example.com", OLD="DioMember123!", NEW="NewDioMember123!";
    @DynamicPropertySource static void key(DynamicPropertyRegistry registry) {
        byte[] bytes=new byte[32];new java.security.SecureRandom().nextBytes(bytes);
        String key=java.util.Base64.getEncoder().encodeToString(bytes);
        registry.add("dio.auth.jwt-secret",()->key);
    }
    @Autowired MockMvc mvc;
    @Autowired EmailVerificationService signupVerification;
    @Autowired EmailSignupService signup;
    @Autowired PasswordResetService service;
    @Autowired PasswordResetRepository resets;
    @Autowired com.f106.DIO.auth.service.PasswordResetDeliveryFailureTracker deliveryFailures;
    @Autowired com.f106.DIO.auth.service.ExpiredVerificationCleanup verificationCleanup;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate transaction;
    @MockitoBean SignupMailSender signupMail;
    @MockitoBean PasswordResetMailSender resetMail;
    @MockitoBean PasswordResetThrottle throttle;
    @MockitoSpyBean LoginSessionRevoker sessions;
    AtomicReference<String> signupCode, resetCode;
    @BeforeEach void setup() {
        jdbc.update("delete from password_reset_verifications");
        jdbc.update("delete from refresh_token_history");jdbc.update("delete from refresh_tokens");
        jdbc.update("delete from signup_profile_photos");jdbc.update("delete from user_terms_agreements");
        jdbc.update("delete from user_auth_accounts");jdbc.update("delete from users");
        jdbc.update("delete from signup_email_verifications");
        reset(signupMail, resetMail, throttle, org.springframework.test.util.AopTestUtils.getUltimateTargetObject(sessions));
        signupCode=new AtomicReference<>();resetCode=new AtomicReference<>();
        doAnswer(i->{signupCode.set(i.getArgument(1));return null;}).when(signupMail).send(anyString(),anyString());
        doAnswer(i->{resetCode.set(i.getArgument(1));return null;}).when(resetMail).send(anyString(),anyString());
    }
    void register(String email,String nickname) {
        signupVerification.send(email);
        String token=signupVerification.verify(new EmailVerificationRequest(email,signupCode.get())).signupToken();
        signup.signup(new SignupRequest(email,token,OLD,nickname,List.of(
            new Agreement(TermsType.SERVICE,"v1",true),
            new Agreement(TermsType.PRIVACY,"v1",true))));
    }
    String sendAndVerify() throws Exception {
        mvc.perform(post("/api/v1/auth/password-reset-requests").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\" RESET@example.com \"}")).andExpect(status().isAccepted());
        verify(resetMail,timeout(3000)).send(eq(EMAIL),anyString());
        return service.verify(new PasswordResetVerificationRequest(EMAIL,resetCode.get())).resetToken();
    }
    String login(String email,String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\""+email+"\",\"password\":\""+password+"\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }
    @Test void authenticatedPasswordChangeInvalidatesPreviouslyVerifiedResetToken()throws Exception{
        register(EMAIL,"비밀번호변경");String token=sendAndVerify();String session=login(EMAIL,OLD);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/v1/me/password")
            .header("Authorization","Bearer "+JsonPath.<String>read(session,"$.accessToken")).contentType(MediaType.APPLICATION_JSON)
            .content("{\"currentPassword\":\""+OLD+"\",\"newPassword\":\""+NEW+"\"}"))
            .andExpect(status().isNoContent());
        assertThat(resets.findById(EMAIL).orElseThrow().getConsumedAt()).isNotNull();
        assertThatThrownBy(()->service.complete(new PasswordResetRequest(EMAIL,token,"AnotherDio123!"))).isInstanceOf(PasswordResetException.class);
        login(EMAIL,NEW);
    }
    @Test void sameResponseForExistingMissingSocialAndInactiveAccounts() throws Exception {
        register(EMAIL,"재설정회원");
        String known=mvc.perform(post("/api/v1/auth/password-reset-requests").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\""+EMAIL+"\"}")).andExpect(status().isAccepted())
            .andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsString();
        verify(resetMail,timeout(3000)).send(eq(EMAIL),anyString());
        for(String email:List.of("missing@example.com","social@example.com","inactive@example.com")) {
            if(!email.startsWith("missing")) {
                register(email,email.startsWith("social")?"소셜회원":"비활성회원");
                if(email.startsWith("social"))jdbc.update("update user_auth_accounts set provider='GOOGLE', password_hash=null where provider_subject=?",email);
                else jdbc.update("update users set status='INACTIVE' where email=?",email);
            }
            mvc.perform(post("/api/v1/auth/password-reset-requests").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\""+email+"\"}")).andExpect(status().isAccepted()).andExpect(content().json(known));
        }
        verify(resetMail,times(1)).send(anyString(),anyString());assertThat(resets.count()).isEqualTo(1);
    }
    @Test void resetRevokesAllOwnDevicesButKeepsOtherUserAndNewPasswordWorks() throws Exception {
        register(EMAIL,"재설정회원");register("other@example.com","다른회원");
        String first=login(EMAIL,OLD),second=login(EMAIL,OLD),other=login("other@example.com",OLD);
        String token=sendAndVerify();
        mvc.perform(post("/api/v1/auth/password-resets").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\""+EMAIL+"\",\"resetToken\":\""+token+"\",\"newPassword\":\""+NEW+"\"}"))
            .andExpect(status().isNoContent()).andExpect(content().string(""));
        for(String session:List.of(first,second)) {
            mvc.perform(post("/api/v1/auth/logout").header("Authorization","Bearer "+JsonPath.<String>read(session,"$.accessToken")))
                .andExpect(status().isUnauthorized());
            mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\""+JsonPath.<String>read(session,"$.refreshToken")+"\"}"))
                .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/v1/auth/logout").header("Authorization","Bearer "+JsonPath.<String>read(other,"$.accessToken")))
            .andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\""+EMAIL+"\",\"password\":\""+OLD+"\"}")).andExpect(status().isUnauthorized());
        login(EMAIL,NEW);
        assertThatThrownBy(()->service.complete(new PasswordResetRequest(EMAIL,token,"AnotherPassword123!")))
            .isInstanceOf(PasswordResetException.class);
        assertThat(jdbc.queryForObject("select password_hash from user_auth_accounts where provider_subject=?",String.class,EMAIL))
            .doesNotContain(NEW).startsWith("$2");
    }
    @Test void wrongAttemptsAreCommittedAndCodeCannotBeReused() throws Exception {
        register(EMAIL,"재설정회원");service.send(EMAIL);
        verify(resetMail,timeout(3000)).send(eq(EMAIL),anyString());
        String wrong=resetCode.get().equals("000000")?"999999":"000000";
        for(int i=0;i<5;i++)assertThatThrownBy(()->service.verify(new PasswordResetVerificationRequest(EMAIL,wrong))).isInstanceOf(PasswordResetException.class);
        assertThat(resets.findById(EMAIL).orElseThrow().getFailedAttempts()).isEqualTo(5);
        assertThatThrownBy(()->service.verify(new PasswordResetVerificationRequest(EMAIL,resetCode.get()))).isInstanceOf(PasswordResetException.class);
    }
    @Test void resendCannotInvalidateVerifiedResetToken() throws Exception {
        register(EMAIL,"재설정회원");String oldToken=sendAndVerify();
        transaction.executeWithoutResult(s->{var row=resets.findForUpdate(EMAIL).orElseThrow();org.springframework.test.util.ReflectionTestUtils.setField(row,"sentAt",Instant.now().minusSeconds(61));});
        service.send(EMAIL);verify(resetMail,times(1)).send(eq(EMAIL),anyString());
        for(int i=0;i<5;i++) assertThatThrownBy(()->service.verify(new PasswordResetVerificationRequest(EMAIL,"000000"))).isInstanceOf(PasswordResetException.class);
        service.complete(new PasswordResetRequest(EMAIL,oldToken,NEW));
        login(EMAIL,NEW);
    }
    @Test void activeCodeSurvivesResendButExpiredCodeCanBeReplaced() throws Exception {
        register(EMAIL,"코드보존");service.send(EMAIL);
        verify(resetMail,timeout(3000)).send(eq(EMAIL),anyString());
        String firstCode=resetCode.get();
        transaction.executeWithoutResult(s->{var row=resets.findForUpdate(EMAIL).orElseThrow();org.springframework.test.util.ReflectionTestUtils.setField(row,"sentAt",Instant.now().minusSeconds(61));});
        service.send(EMAIL);
        verify(resetMail,times(1)).send(eq(EMAIL),anyString());
        String token=service.verify(new PasswordResetVerificationRequest(EMAIL,firstCode)).resetToken();
        transaction.executeWithoutResult(s->{var row=resets.findForUpdate(EMAIL).orElseThrow();org.springframework.test.util.ReflectionTestUtils.setField(row,"expiresAt",Instant.now().minusSeconds(1));org.springframework.test.util.ReflectionTestUtils.setField(row,"tokenExpiresAt",Instant.now().minusSeconds(1));});
        service.send(EMAIL);
        verify(resetMail,timeout(3000).times(2)).send(eq(EMAIL),anyString());
        assertThatThrownBy(()->service.complete(new PasswordResetRequest(EMAIL,token,NEW))).isInstanceOf(PasswordResetException.class);
        assertThat(service.verify(new PasswordResetVerificationRequest(EMAIL,resetCode.get())).resetToken()).isNotBlank();
    }
    @Test void expiredWrongEmailAndSignupTokensCannotResetPassword() throws Exception {
        register(EMAIL,"재설정회원");register("other@example.com","다른회원");String token=sendAndVerify();
        assertThatThrownBy(()->service.complete(new PasswordResetRequest("other@example.com",token,NEW))).isInstanceOf(PasswordResetException.class);
        signupVerification.send("new@example.com");
        String signupToken=signupVerification.verify(new EmailVerificationRequest("new@example.com",signupCode.get())).signupToken();
        assertThatThrownBy(()->service.complete(new PasswordResetRequest(EMAIL,signupToken,NEW))).isInstanceOf(PasswordResetException.class);
        assertThatThrownBy(()->signup.signup(new SignupRequest("new@example.com",token,OLD,"신규회원",List.of(
            new Agreement(TermsType.SERVICE,"v1",true),new Agreement(TermsType.PRIVACY,"v1",true)))))
            .isInstanceOf(SignupException.class);
        transaction.executeWithoutResult(s->{org.springframework.test.util.ReflectionTestUtils.setField(resets.findForUpdate(EMAIL).orElseThrow(),"tokenExpiresAt",Instant.now().minusSeconds(1));});
        assertThatThrownBy(()->service.complete(new PasswordResetRequest(EMAIL,token,NEW))).isInstanceOf(PasswordResetException.class);
        login(EMAIL,OLD);
    }
    @Test void concurrentConsumptionSucceedsExactlyOnce() throws Exception {
        register(EMAIL,"재설정회원");String token=sendAndVerify();
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        Callable<Boolean> attempt=()->{start.await();try {service.complete(new PasswordResetRequest(EMAIL,token,NEW));return true;}
            catch(PasswordResetException error){return false;}};
        try {var first=pool.submit(attempt);var second=pool.submit(attempt);start.countDown();
            assertThat(List.of(first.get(10,TimeUnit.SECONDS),second.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        } finally {pool.shutdownNow();}
    }
    @Test void smtpFailureDoesNotRevealAccountOrFailAcceptedRequest() throws Exception {
        register(EMAIL,"재설정회원");doThrow(new IllegalStateException("SMTP unavailable")).when(resetMail).send(anyString(),anyString());
        mvc.perform(post("/api/v1/auth/password-reset-requests").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\""+EMAIL+"\"}")).andExpect(status().isAccepted());
        verify(resetMail,timeout(3000)).send(eq(EMAIL),anyString());
        for(int i=0;i<100 && resets.findById(EMAIL).orElseThrow().getExpiresAt().isAfter(Instant.now());i++) Thread.sleep(20);
        assertThat(resets.findById(EMAIL).orElseThrow().getExpiresAt()).isBeforeOrEqualTo(Instant.now());
        // 60초 제한은 그대로 유지하고, 이후 SMTP가 회복되면 10분을 기다리지 않고 새로 발급한다.
        transaction.executeWithoutResult(s->org.springframework.test.util.ReflectionTestUtils.setField(resets.findForUpdate(EMAIL).orElseThrow(),"sentAt",Instant.now().minusSeconds(61)));
        doNothing().when(resetMail).send(anyString(),anyString());
        service.send(EMAIL);
        verify(resetMail,timeout(3000).times(2)).send(eq(EMAIL),anyString());
        assertThat(resets.findById(EMAIL).orElseThrow().getExpiresAt()).isAfter(Instant.now());
    }
    @Test void delayedDeliveryFailureDoesNotExpireNewGenerationOrVerifiedToken() throws Exception {
        register(EMAIL,"지연실패"); service.send(EMAIL);
        verify(resetMail,timeout(3000)).send(eq(EMAIL),anyString());
        var old=resets.findById(EMAIL).orElseThrow();
        transaction.executeWithoutResult(s->{var row=resets.findForUpdate(EMAIL).orElseThrow();org.springframework.test.util.ReflectionTestUtils.setField(row,"sentAt",Instant.now().minusSeconds(601));org.springframework.test.util.ReflectionTestUtils.setField(row,"expiresAt",Instant.now().minusSeconds(1));});
        service.send(EMAIL);verify(resetMail,timeout(3000).times(2)).send(eq(EMAIL),anyString());
        deliveryFailures.failed(EMAIL,old.getCodeHash(),old.getSentAt());
        var current=resets.findById(EMAIL).orElseThrow();
        assertThat(current.getExpiresAt()).isAfter(Instant.now());
        String token=service.verify(new PasswordResetVerificationRequest(EMAIL,resetCode.get())).resetToken();
        deliveryFailures.failed(EMAIL,current.getCodeHash(),current.getSentAt());
        service.complete(new PasswordResetRequest(EMAIL,token,NEW));
        login(EMAIL,NEW);
    }
    @Test void failureRollsBackPasswordTokenConsumptionAndSessionRevocation() throws Exception {
        register(EMAIL,"재설정회원");String login=login(EMAIL,OLD),token=sendAndVerify();
        LoginSessionRevoker target=org.springframework.test.util.AopTestUtils.getUltimateTargetObject(sessions);
        doAnswer(invocation->{invocation.callRealMethod();throw new IllegalStateException("session update unavailable");})
            .when(target).revokeAll(anyLong(),any());
        assertThatThrownBy(()->service.complete(new PasswordResetRequest(EMAIL,token,NEW)))
            .isInstanceOf(IllegalStateException.class);
        assertThat(resets.findById(EMAIL).orElseThrow().getConsumedAt()).isNull();
        login(EMAIL,OLD);
        mvc.perform(post("/api/v1/auth/logout").header("Authorization","Bearer "+JsonPath.<String>read(login,"$.accessToken")))
            .andExpect(status().isNoContent());
    }
    @Test void rolledBackIssuanceDoesNotSendEmail() {
        register(EMAIL,"재설정회원");
        transaction.executeWithoutResult(status->{service.send(EMAIL);status.setRollbackOnly();});
        assertThat(resets.count()).isZero();verifyNoInteractions(resetMail);
    }
    @Test void deactivatedAccountCannotConsumeVerifiedToken() throws Exception {
        register(EMAIL,"재설정회원");String token=sendAndVerify();
        jdbc.update("update users set status='INACTIVE' where email=?",EMAIL);
        assertThatThrownBy(()->service.complete(new PasswordResetRequest(EMAIL,token,NEW)))
            .isInstanceOf(PasswordResetException.class);
        assertThat(resets.findById(EMAIL).orElseThrow().getConsumedAt()).isNull();
    }
    @Test void oldPasswordLoginWaitsForResetTransactionThenFails() throws Exception {
        register(EMAIL,"재설정회원");String token=sendAndVerify();
        var locked=new CountDownLatch(1);var finish=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        try {
            var resetting=pool.submit(()->transaction.executeWithoutResult(status->{
                service.complete(new PasswordResetRequest(EMAIL,token,NEW));locked.countDown();
                try {if(!finish.await(10,TimeUnit.SECONDS))throw new IllegalStateException("test release timeout");}
                catch(InterruptedException error){Thread.currentThread().interrupt();throw new IllegalStateException(error);}
            }));
            assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
            var loggingIn=pool.submit(()->mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\""+EMAIL+"\",\"password\":\""+OLD+"\"}"))
                .andReturn().getResponse().getStatus());
            try {assertThatThrownBy(()->loggingIn.get(200,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);}
            finally {finish.countDown();}
            resetting.get(10,TimeUnit.SECONDS);assertThat(loggingIn.get(10,TimeUnit.SECONDS)).isEqualTo(401);
            assertThat(jdbc.queryForObject("select count(*) from refresh_tokens",Long.class)).isZero();
        } finally {finish.countDown();pool.shutdownNow();}
    }
    @Test void verificationCleanupPreservesFreshRowsAndUnexpiredTokens() {
        register(EMAIL,"정리테스트");
        service.send(EMAIL);
        register("fresh@example.com","최근인증");
        var old = java.sql.Timestamp.from(Instant.now().minusSeconds(172800));
        var future = java.sql.Timestamp.from(Instant.now().plusSeconds(600));
        jdbc.update("update signup_email_verifications set expires_at=?, token_expires_at=? where email=?",old,future,EMAIL);
        jdbc.update("update password_reset_verifications set expires_at=?, token_expires_at=? where email=?",old,future,EMAIL);
        assertThat(verificationCleanup.purgeExpired()).isZero();
        jdbc.update("update signup_email_verifications set token_expires_at=? where email=?",old,EMAIL);
        assertThat(verificationCleanup.purgeExpired()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from signup_email_verifications where email='fresh@example.com'",Long.class)).isEqualTo(1);
        assertThat(resets.existsById(EMAIL)).isTrue();
        jdbc.update("update password_reset_verifications set token_expires_at=? where email=?",old,EMAIL);
        assertThat(verificationCleanup.purgeExpired()).isEqualTo(1);
        assertThat(resets.existsById(EMAIL)).isFalse();
    }

    @Test void dtoValidationAndSwaggerDescribeAllThreeEndpoints() throws Exception {
        mvc.perform(post("/api/v1/auth/password-reset-requests").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"invalid\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/auth/password-reset-verifications").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"reset@example.com\",\"code\":\"123\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/auth/password-resets").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"reset@example.com\",\"resetToken\":\"invalid\",\"newPassword\":\"123\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andExpect(jsonPath("$.paths['/api/v1/auth/password-reset-requests'].post.responses['202']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/password-reset-verifications']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/password-resets'].post.responses['204']").exists());
    }
    @Test void rateLimitAndCorsWorkWithoutLoginToken() throws Exception {
        var limited=new PasswordResetException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,"PASSWORD_RESET_RATE_LIMITED","잠시 후 다시 시도해 주세요.");
        limited.retryAfter=60;
        doThrow(limited).when(throttle).check(eq("send"),anyString(),anyString());
        mvc.perform(post("/api/v1/auth/password-reset-requests").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"reset@example.com\"}"))
            .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","60"))
            .andExpect(jsonPath("$.code").value("PASSWORD_RESET_RATE_LIMITED"));
        for(String path:List.of("password-reset-requests","password-reset-verifications","password-resets"))
            mvc.perform(options("/api/v1/auth/"+path).header("Origin","http://localhost:8081")
                .header("Access-Control-Request-Method","POST").header("Access-Control-Request-Headers","content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:8081"));
    }
}
