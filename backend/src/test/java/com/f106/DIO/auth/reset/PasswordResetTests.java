package com.f106.DIO.auth.reset;

import com.f106.DIO.auth.signup.*;
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
import com.f106.DIO.auth.login.LoginSessionRevoker;
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
        String token=signupVerification.verify(new SignupDtos.VerifyRequest(email,signupCode.get())).signupToken();
        signup.signup(new SignupDtos.SignupRequest(email,token,OLD,nickname,List.of(
            new SignupDtos.Agreement(SignupDtos.TermsType.SERVICE,"v1",true),
            new SignupDtos.Agreement(SignupDtos.TermsType.PRIVACY,"v1",true))));
    }
    String sendAndVerify() throws Exception {
        mvc.perform(post("/api/v1/auth/password-reset-requests").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\" RESET@example.com \"}")).andExpect(status().isAccepted());
        verify(resetMail,timeout(3000)).send(eq(EMAIL),anyString());
        return service.verify(new PasswordResetDtos.VerifyRequest(EMAIL,resetCode.get())).resetToken();
    }
    String login(String email,String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\""+email+"\",\"password\":\""+password+"\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
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
        assertThatThrownBy(()->service.complete(new PasswordResetDtos.ResetRequest(EMAIL,token,"AnotherPassword123!")))
            .isInstanceOf(PasswordResetException.class);
        assertThat(jdbc.queryForObject("select password_hash from user_auth_accounts where provider_subject=?",String.class,EMAIL))
            .doesNotContain(NEW).startsWith("$2");
    }
    @Test void wrongAttemptsAreCommittedAndCodeCannotBeReused() throws Exception {
        register(EMAIL,"재설정회원");service.send(EMAIL);
        verify(resetMail,timeout(3000)).send(eq(EMAIL),anyString());
        String wrong=resetCode.get().equals("000000")?"999999":"000000";
        for(int i=0;i<5;i++)assertThatThrownBy(()->service.verify(new PasswordResetDtos.VerifyRequest(EMAIL,wrong))).isInstanceOf(PasswordResetException.class);
        assertThat(resets.findById(EMAIL).orElseThrow().failedAttempts).isEqualTo(5);
        assertThatThrownBy(()->service.verify(new PasswordResetDtos.VerifyRequest(EMAIL,resetCode.get()))).isInstanceOf(PasswordResetException.class);
    }
    @Test void resendInvalidatesPreviousResetTokenAndCodeExpires() throws Exception {
        register(EMAIL,"재설정회원");String oldToken=sendAndVerify();
        transaction.executeWithoutResult(s->{var row=resets.findForUpdate(EMAIL).orElseThrow();row.sentAt=Instant.now().minusSeconds(61);});
        service.send(EMAIL);verify(resetMail,timeout(3000).times(2)).send(eq(EMAIL),anyString());
        assertThatThrownBy(()->service.complete(new PasswordResetDtos.ResetRequest(EMAIL,oldToken,NEW))).isInstanceOf(PasswordResetException.class);
        transaction.executeWithoutResult(s->{var row=resets.findForUpdate(EMAIL).orElseThrow();row.expiresAt=Instant.now().minusSeconds(1);});
        assertThatThrownBy(()->service.verify(new PasswordResetDtos.VerifyRequest(EMAIL,resetCode.get()))).isInstanceOf(PasswordResetException.class);
    }
    @Test void expiredWrongEmailAndSignupTokensCannotResetPassword() throws Exception {
        register(EMAIL,"재설정회원");register("other@example.com","다른회원");String token=sendAndVerify();
        assertThatThrownBy(()->service.complete(new PasswordResetDtos.ResetRequest("other@example.com",token,NEW))).isInstanceOf(PasswordResetException.class);
        signupVerification.send("new@example.com");
        String signupToken=signupVerification.verify(new SignupDtos.VerifyRequest("new@example.com",signupCode.get())).signupToken();
        assertThatThrownBy(()->service.complete(new PasswordResetDtos.ResetRequest(EMAIL,signupToken,NEW))).isInstanceOf(PasswordResetException.class);
        assertThatThrownBy(()->signup.signup(new SignupDtos.SignupRequest("new@example.com",token,OLD,"신규회원",List.of(
            new SignupDtos.Agreement(SignupDtos.TermsType.SERVICE,"v1",true),new SignupDtos.Agreement(SignupDtos.TermsType.PRIVACY,"v1",true)))))
            .isInstanceOf(SignupException.class);
        transaction.executeWithoutResult(s->{resets.findForUpdate(EMAIL).orElseThrow().tokenExpiresAt=Instant.now().minusSeconds(1);});
        assertThatThrownBy(()->service.complete(new PasswordResetDtos.ResetRequest(EMAIL,token,NEW))).isInstanceOf(PasswordResetException.class);
        login(EMAIL,OLD);
    }
    @Test void concurrentConsumptionSucceedsExactlyOnce() throws Exception {
        register(EMAIL,"재설정회원");String token=sendAndVerify();
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        Callable<Boolean> attempt=()->{start.await();try {service.complete(new PasswordResetDtos.ResetRequest(EMAIL,token,NEW));return true;}
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
    }
    @Test void failureRollsBackPasswordTokenConsumptionAndSessionRevocation() throws Exception {
        register(EMAIL,"재설정회원");String login=login(EMAIL,OLD),token=sendAndVerify();
        LoginSessionRevoker target=org.springframework.test.util.AopTestUtils.getUltimateTargetObject(sessions);
        doAnswer(invocation->{invocation.callRealMethod();throw new IllegalStateException("session update unavailable");})
            .when(target).revokeAll(anyLong(),any());
        assertThatThrownBy(()->service.complete(new PasswordResetDtos.ResetRequest(EMAIL,token,NEW)))
            .isInstanceOf(IllegalStateException.class);
        assertThat(resets.findById(EMAIL).orElseThrow().consumedAt).isNull();
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
        assertThatThrownBy(()->service.complete(new PasswordResetDtos.ResetRequest(EMAIL,token,NEW)))
            .isInstanceOf(PasswordResetException.class);
        assertThat(resets.findById(EMAIL).orElseThrow().consumedAt).isNull();
    }
    @Test void oldPasswordLoginWaitsForResetTransactionThenFails() throws Exception {
        register(EMAIL,"재설정회원");String token=sendAndVerify();
        var locked=new CountDownLatch(1);var finish=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        try {
            var resetting=pool.submit(()->transaction.executeWithoutResult(status->{
                service.complete(new PasswordResetDtos.ResetRequest(EMAIL,token,NEW));locked.countDown();
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
