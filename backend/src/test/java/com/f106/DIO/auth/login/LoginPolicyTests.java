package com.f106.DIO.auth.login;

import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class LoginPolicyTests {
    static class MovingClock extends Clock {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    @Test void failedLoginLimitExpiresAndIsIndependentOfAnotherAddress() {
        var clock = new MovingClock(); var throttle = new LoginThrottle(clock);
        for (int i = 0; i < 5; i++) { throttle.check("member@example.com", "a"); throttle.failed("member@example.com", "a"); }
        assertThatThrownBy(() -> throttle.check("member@example.com", "a")).isInstanceOf(LoginException.class);
        throttle.check("member@example.com", "b");
        clock.now = clock.now.plusSeconds(901); throttle.check("member@example.com", "a");
    }
    @Test void successResetsPairButDoesNotResetAddressFailureBudget() {
        var throttle = new LoginThrottle(new MovingClock());
        for (int i = 0; i < 4; i++) throttle.failed("member@example.com", "a");
        throttle.success("member@example.com", "a");
        throttle.failed("member@example.com", "a"); throttle.check("member@example.com", "a");
        for (int i = 0; i < 95; i++) throttle.failed("different-" + i + "@example.com", "a");
        assertThatThrownBy(() -> throttle.check("new@example.com", "a")).isInstanceOf(LoginException.class);
    }
    @Test void missingOrShortSigningKeyFailsWithoutExposingConfiguration() {
        for (String secret : new String[] {"", "not base64", "c2hvcnQ="}) {
            var jwt = new LoginJwt(new LoginProperties(secret, 900, 2592000));
            assertThatThrownBy(() -> jwt.issue(1L, UUID.randomUUID(), Instant.now(), Instant.now().plusSeconds(900)))
                .isInstanceOfSatisfying(LoginException.class, error -> assertThat(error.code).isEqualTo("LOGIN_NOT_CONFIGURED"));
        }
    }
    @Test void tokenAndPasswordRecordsAreRedacted() {
        assertThat(new LoginDtos.LoginRequest("member@example.com", "PrivatePass123!", null).toString()).doesNotContain("PrivatePass123!");
        assertThat(new LoginDtos.RefreshRequest("private-token").toString()).doesNotContain("private-token");
        assertThat(new LoginProperties("private-secret", 900, 2592000).toString()).doesNotContain("private-secret");
    }
}
