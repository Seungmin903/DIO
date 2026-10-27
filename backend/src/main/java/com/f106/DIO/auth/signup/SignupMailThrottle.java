package com.f106.DIO.auth.signup;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** 서버 한 대의 가입 메일 요청 제한. 등록 여부·SMTP 성공 여부와 무관하게 요청을 센다. */
@Component
class SignupMailThrottle {
    private record Window(int requests, Instant expiresAt) {}
    private final Clock clock;
    private final Map<String, Window> windows = new LinkedHashMap<>(256, .75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Window> entry) { return size() > 20000; }
    };
    SignupMailThrottle() { this(Clock.systemUTC()); }
    SignupMailThrottle(Clock clock) { this.clock = clock; }
    synchronized void check(String remoteAddress) {
        String key = SignupSecrets.tokenHash("signup-mail-ip:" + remoteAddress);
        Instant now = clock.instant();
        Window window = windows.get(key);
        if (window == null || !now.isBefore(window.expiresAt())) window = new Window(0, now.plusSeconds(900));
        if (window.requests() >= 20) {
            long retryAfter = Math.max(1, (Duration.between(now, window.expiresAt()).toMillis() + 999) / 1000);
            throw new SignupException(HttpStatus.TOO_MANY_REQUESTS, "SIGNUP_MAIL_IP_RATE_LIMITED",
                "이 네트워크의 인증 메일 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", retryAfter);
        }
        windows.put(key, new Window(window.requests() + 1, window.expiresAt()));
    }
}
