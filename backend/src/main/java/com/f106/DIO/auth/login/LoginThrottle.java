package com.f106.DIO.auth.login;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** 한 서버의 실패 시도 제한. 프록시/다중 서버의 공통 제한은 인프라 계층에서 적용한다. */
@Component
class LoginThrottle {
    private record Attempt(int count, Instant expires) {}
    private final Clock clock;
    private final Map<String, Attempt> attempts = new LinkedHashMap<>(256, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Attempt> entry) { return size() > 20000; }
    };
    LoginThrottle() { this(Clock.systemUTC()); }
    LoginThrottle(Clock clock) { this.clock = clock; }
    private String pair(String email, String ip) { return LoginSecrets.hash("pair:" + email + "\u0000" + ip); }
    private String address(String ip) { return LoginSecrets.hash("ip:" + ip); }
    private int count(String key) {
        Attempt attempt = attempts.get(key);
        if (attempt == null) return 0;
        if (!clock.instant().isBefore(attempt.expires)) { attempts.remove(key); return 0; }
        return attempt.count;
    }
    synchronized void check(String email, String ip) {
        if (count(pair(email, ip)) >= 5 || count(address(ip)) >= 100) {
            throw new LoginException(HttpStatus.TOO_MANY_REQUESTS, "LOGIN_RATE_LIMITED", "로그인 시도가 너무 많아요. 15분 후 다시 시도해 주세요.");
        }
    }
    synchronized void failed(String email, String ip) { increment(pair(email, ip)); increment(address(ip)); }
    private void increment(String key) {
        int count = count(key);
        Attempt old = attempts.get(key);
        attempts.put(key, new Attempt(count + 1, old == null ? clock.instant().plusSeconds(900) : old.expires));
    }
    synchronized void success(String email, String ip) { attempts.remove(pair(email, ip)); }
}
