package com.f106.DIO.auth.signup;

import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SignupMailRateLimitApiTests {
    private MockMvc mvc(EmailVerificationService verification) {
        var clock=new SignupMailThrottleTests.MutableClock();
        return MockMvcBuilders.standaloneSetup(new SignupController(mock(EmailSignupService.class),verification,new SignupMailThrottle(clock)))
            .setControllerAdvice(new SignupExceptionHandler()).build();
    }
    @Test void changingEmailOrSpoofingForwardedHeaderDoesNotBypassIpLimit() throws Exception {
        var verification=mock(EmailVerificationService.class);when(verification.send(anyString())).thenReturn(new SignupDtos.SentResponse(600,60));
        var mvc=mvc(verification);
        for(int i=0;i<20;i++)mvc.perform(post("/api/v1/auth/email-verifications").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"recipient"+i+"@example.com\"}").with(request->{request.setRemoteAddr("192.0.2.1");return request;}))
            .andExpect(status().isOk());
        mvc.perform(post("/api/v1/auth/email-verifications").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"new@example.com\"}").header("X-Forwarded-For","198.51.100.99")
            .with(request->{request.setRemoteAddr("192.0.2.1");return request;}))
            .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","900"))
            .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.code").value("SIGNUP_MAIL_IP_RATE_LIMITED"));
        verify(verification,times(20)).send(anyString());
        mvc.perform(post("/api/v1/auth/email-verifications").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"another@example.com\"}").with(request->{request.setRemoteAddr("192.0.2.2");return request;}))
            .andExpect(status().isOk());
    }
    @Test void registrationConflictsAndMailFailuresAlsoConsumeBudget() throws Exception {
        var verification=mock(EmailVerificationService.class);
        when(verification.send(anyString())).thenAnswer(invocation->{
            if(invocation.<String>getArgument(0).startsWith("registered"))throw SignupException.conflict("EMAIL_ALREADY_REGISTERED","이미 가입된 이메일이에요.");
            throw new SignupException(HttpStatus.SERVICE_UNAVAILABLE,"EMAIL_DELIVERY_UNAVAILABLE","메일을 보내지 못했어요.");
        });
        var mvc=mvc(verification);
        for(int i=0;i<20;i++)mvc.perform(post("/api/v1/auth/email-verifications").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\""+(i%2==0?"registered":"delivery")+i+"@example.com\"}"))
            .andExpect(status().is(i%2==0?409:503));
        mvc.perform(post("/api/v1/auth/email-verifications").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"new@example.com\"}"))
            .andExpect(status().isTooManyRequests());
        verify(verification,times(20)).send(anyString());
    }
    @Test void existingEmailCooldownStillReturnsSixtySeconds() throws Exception {
        var verification=mock(EmailVerificationService.class);
        when(verification.send(anyString())).thenThrow(new SignupException(HttpStatus.TOO_MANY_REQUESTS,"VERIFICATION_RATE_LIMITED","다시 요청해 주세요."));
        mvc(verification).perform(post("/api/v1/auth/email-verifications").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"member@example.com\"}"))
            .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","60"))
            .andExpect(jsonPath("$.code").value("VERIFICATION_RATE_LIMITED"));
    }
}
