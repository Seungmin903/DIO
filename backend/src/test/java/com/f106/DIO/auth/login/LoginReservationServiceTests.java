package com.f106.DIO.auth.login;

import com.f106.DIO.auth.signup.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import org.springframework.http.MediaType;

class LoginReservationServiceTests {
    private EmailLoginService service(EmailAuthProviderRepository accounts) {
        var jwt = mock(LoginJwt.class);
        return new EmailLoginService(mock(SignupUserRepository.class), accounts,
            mock(SignupProfilePhotoRepository.class), mock(RefreshTokenRepository.class),
            mock(RefreshTokenHistoryRepository.class), jwt,
            new LoginProperties("", 900, 2592000), new LoginThrottle(),
            mock(org.springframework.transaction.PlatformTransactionManager.class));
    }
    @Test void twentyParallelWrongPasswordsOnlyPerformFiveCredentialChecks() throws Exception {
        var accounts = mock(EmailAuthProviderRepository.class);
        when(accounts.findByProviderAndProviderUserId("EMAIL", "member@example.com")).thenReturn(Optional.empty());
        var service = service(accounts);
        var mvc = MockMvcBuilders.standaloneSetup(new LoginController(service))
            .setControllerAdvice(new LoginExceptionHandler()).build();
        var pool = Executors.newFixedThreadPool(20);
        var start = new CountDownLatch(1);
        var futures = new ArrayList<Future<String>>();
        try {
            for (int i = 0; i < 20; i++) futures.add(pool.submit(() -> {
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                var response = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"member@example.com\",\"password\":\"WrongPass123!\"}"))
                    .andReturn().getResponse();
                assertThat(response.getStatus()).isIn(401, 429);
                if (response.getStatus() == 429) assertThat(response.getHeader("Retry-After")).isEqualTo("900");
                return Integer.toString(response.getStatus());
            }));
            start.countDown();
            var codes = new ArrayList<String>();
            for (var future : futures) codes.add(future.get(30, TimeUnit.SECONDS));
            assertThat(Collections.frequency(codes, "401")).isEqualTo(5);
            assertThat(Collections.frequency(codes, "429")).isEqualTo(15);
            verify(accounts, times(5)).findByProviderAndProviderUserId("EMAIL", "member@example.com");
        } finally { pool.shutdownNow(); }
    }
    @Test void databaseFailureRefundsPendingAttempt() {
        var accounts = mock(EmailAuthProviderRepository.class);
        when(accounts.findByProviderAndProviderUserId("EMAIL", "member@example.com"))
            .thenThrow(new IllegalStateException("database unavailable")).thenReturn(Optional.empty());
        var service = service(accounts);
        var request = new LoginDtos.LoginRequest("member@example.com", "WrongPass123!", null);
        assertThatThrownBy(() -> service.login(request, "ip")).isInstanceOf(IllegalStateException.class);
        for (int i = 0; i < 5; i++) assertThatThrownBy(() -> service.login(request, "ip"))
            .isInstanceOfSatisfying(LoginException.class, error -> assertThat(error.code).isEqualTo("INVALID_CREDENTIALS"));
        assertThatThrownBy(() -> service.login(request, "ip"))
            .isInstanceOfSatisfying(LoginException.class, error -> assertThat(error.code).isEqualTo("LOGIN_RATE_LIMITED"));
    }
}
