package com.f106.DIO.auth.reset;

import java.time.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PasswordResetThrottleTests {
    static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-26T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    @Test void emailCooldownIsIndependentOfIpAndExpires() {
        var clock = new MutableClock(); var throttle = new PasswordResetThrottle(clock);
        throttle.check("send", "member@example.com", "ip-one");
        assertThatThrownBy(() -> throttle.check("send", "member@example.com", "ip-two"))
            .isInstanceOfSatisfying(PasswordResetException.class, error -> assertThat(error.retryAfter).isEqualTo(60));
        clock.now = clock.now.plusSeconds(60);
        throttle.check("send", "member@example.com", "ip-two");
    }
    @Test void ipBudgetCoversDifferentEmailsAndUnknownAccounts() {
        var clock = new MutableClock(); var throttle = new PasswordResetThrottle(clock);
        for (int i=0; i<20; i++) throttle.check("send", "missing"+i+"@example.com", "ip");
        assertThatThrownBy(() -> throttle.check("send", "new@example.com", "ip"))
            .isInstanceOfSatisfying(PasswordResetException.class, error -> assertThat(error.retryAfter).isEqualTo(900));
        throttle.check("send", "new@example.com", "different-ip");
        clock.now = clock.now.plusSeconds(900); throttle.check("send", "newer@example.com", "ip");
    }
    @Test void verificationAndCompletionHaveIndependentIpBudgets() {
        var throttle = new PasswordResetThrottle();
        for (int i=0; i<100; i++) throttle.check("verify", "any@example.com", "ip");
        assertThatThrownBy(() -> throttle.check("verify", "other@example.com", "ip")).isInstanceOf(PasswordResetException.class);
        throttle.check("reset", "any@example.com", "ip");
    }
}
