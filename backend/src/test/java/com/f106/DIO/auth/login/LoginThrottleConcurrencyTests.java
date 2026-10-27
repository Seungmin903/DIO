package com.f106.DIO.auth.login;

import java.util.ArrayList;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class LoginThrottleConcurrencyTests {
    @Test void simultaneousAttemptsCannotExceedPairBudget() throws Exception {
        assertBurst(20, false, 5);
    }
    @Test void simultaneousDifferentAccountsCannotExceedIpBudget() throws Exception {
        assertBurst(120, true, 100);
    }
    private void assertBurst(int count, boolean differentAccounts, int expected) throws Exception {
        var throttle = new LoginThrottle();
        var pool = Executors.newFixedThreadPool(count);
        var start = new CountDownLatch(1);
        var futures = new ArrayList<Future<LoginThrottle.Reservation>>();
        try {
            for (int i = 0; i < count; i++) {
                String email = (differentAccounts ? "member-" + i : "member") + "@example.com";
                futures.add(pool.submit(() -> {
                    if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                    try { return throttle.reserve(email, "same-ip"); }
                    catch (LoginException error) {
                        assertThat(error.code).isEqualTo("LOGIN_RATE_LIMITED");
                        return null;
                    }
                }));
            }
            start.countDown();
            var reservations = new ArrayList<LoginThrottle.Reservation>();
            // 모든 요청의 판단이 끝날 때까지 예약을 유지해 BCrypt 진행 중 상황을 재현한다.
            for (var future : futures) {
                var reservation = future.get(15, TimeUnit.SECONDS);
                if (reservation != null) reservations.add(reservation);
            }
            assertThat(reservations).hasSize(expected);
            reservations.forEach(throttle::failed);
            assertThatThrownBy(() -> throttle.reserve("member@example.com", "same-ip"))
                .isInstanceOf(LoginException.class);
        } finally { pool.shutdownNow(); }
    }
    @Test void successDoesNotEraseOtherPendingReservations() {
        var throttle = new LoginThrottle();
        var pending = new ArrayList<LoginThrottle.Reservation>();
        for (int i = 0; i < 5; i++) pending.add(throttle.reserve("member@example.com", "ip"));
        throttle.success(pending.get(0));
        throttle.cancel(pending.get(0)); // finally의 중복 완료는 예산을 추가 환불하지 않는다.
        var replacement = throttle.reserve("member@example.com", "ip");
        assertThatThrownBy(() -> throttle.reserve("member@example.com", "ip")).isInstanceOf(LoginException.class);
        throttle.cancel(replacement);
        pending.forEach(throttle::cancel);
    }
    @Test void expiredWindowStillCountsPendingVerificationAndCancellationRefundsIt() {
        var clock = new LoginPolicyTests.MovingClock();
        var throttle = new LoginThrottle(clock);
        var pending = new ArrayList<LoginThrottle.Reservation>();
        for (int i = 0; i < 5; i++) pending.add(throttle.reserve("member@example.com", "ip"));
        clock.now = clock.now.plusSeconds(901);
        assertThatThrownBy(() -> throttle.reserve("member@example.com", "ip")).isInstanceOf(LoginException.class);
        pending.forEach(throttle::cancel);
        throttle.cancel(throttle.reserve("member@example.com", "ip"));
    }
}
