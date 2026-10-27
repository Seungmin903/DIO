package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.exception.PasswordResetException;
import com.f106.DIO.auth.support.PasswordResetThrottle;

import java.time.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PasswordResetThrottleTests {
    @Test void saturationCannotEvictExistingIpBudgetAndExpiredCapacityIsReclaimed() {
        var clock = new MutableClock(); var throttle = new PasswordResetThrottle(clock);
        for (int i=0;i<20;i++) throttle.check("send","victim"+i+"@example.com","limited-ip");
        for (int i=0;i<19999;i++) throttle.check("verify","any@example.com","new-ip-"+i);
        assertThatThrownBy(()->throttle.check("verify","any@example.com","overflow-ip"))
            .isInstanceOf(PasswordResetException.class);
        assertThatThrownBy(()->throttle.check("send","next@example.com","limited-ip"))
            .isInstanceOfSatisfying(PasswordResetException.class,e->assertThat(e.retryAfter).isEqualTo(900));
        clock.now=clock.now.plusSeconds(900);
        throttle.check("send","next@example.com","limited-ip");
        throttle.check("verify","any@example.com","overflow-ip");
    }
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
