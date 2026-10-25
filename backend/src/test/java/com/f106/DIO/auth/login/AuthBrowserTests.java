package com.f106.DIO.auth.login;

import com.f106.DIO.auth.signup.*;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named = "DIO_AUTH_BROWSER_QA", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:auth-browser;MODE=PostgreSQL",
    "dio.signup.verification-secret=browser-test-secret-at-least-32-bytes-long",
    "dio.auth.jwt-secret=dGVzdGluZy1vbmx5LWtleS1mb3ItYXV0aC0zMi1ieXRlcw==",
    "AUTH_ALLOWED_ORIGINS=http://127.0.0.1:18081"
})
@ActiveProfiles("test")
class AuthBrowserTests {
    @LocalServerPort int port;
    @Autowired EmailVerificationService verification;
    @Autowired EmailSignupService signup;
    @MockitoBean SignupMailSender mail;

    @Test void existingFrontendConnectsToRealBackend() throws Exception {
        var code = new AtomicReference<String>();
        doAnswer(invocation -> { code.set(invocation.getArgument(1)); return null; })
            .when(mail).send(anyString(), anyString());
        String email = "browser-auth@example.com";
        verification.send(email);
        String token = verification.verify(new SignupDtos.VerifyRequest(email, code.get())).signupToken();
        signup.signup(new SignupDtos.SignupRequest(email, token, "DioMember123!", "브라우저회원",
            List.of(new SignupDtos.Agreement(SignupDtos.TermsType.SERVICE, "v1", true),
                new SignupDtos.Agreement(SignupDtos.TermsType.PRIVACY, "v1", true))));
        Path script = Path.of("../frontend/qa/auth-api-browser.cjs").toAbsolutePath().normalize();
        Process browser = new ProcessBuilder("node", script.toString(), "http://127.0.0.1:" + port)
            .inheritIO().start();
        try {
            assertThat(browser.waitFor(90, TimeUnit.SECONDS)).as("browser QA completed").isTrue();
            assertThat(browser.exitValue()).isZero();
        } finally { if (browser.isAlive()) browser.destroyForcibly(); }
    }
}
