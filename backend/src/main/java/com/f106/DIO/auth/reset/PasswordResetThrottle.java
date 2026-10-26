package com.f106.DIO.auth.reset;

import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
class PasswordResetThrottle {
    private record Attempt(int count, Instant expires) {}
    private final Clock clock;
    private final Map<String, Attempt> attempts = new LinkedHashMap<>(256, .75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Attempt> entry) { return size() > 20000; }
    };
    PasswordResetThrottle() { this(Clock.systemUTC()); }
    PasswordResetThrottle(Clock clock) { this.clock = clock; }
    private int count(String key) {
        var attempt = attempts.get(key);
        if (attempt == null) return 0;
        if (!clock.instant().isBefore(attempt.expires)) { attempts.remove(key); return 0; }
        return attempt.count;
    }
    synchronized void check(String operation, String email, String ip) {
        String address = PasswordResetSecrets.hash(operation + ":ip:" + ip);
        String recipient = PasswordResetSecrets.hash("send:email:" + email);
        if (count(address) >= (operation.equals("send") ? 20 : 100)) throw limited(900);
        if (operation.equals("send") && count(recipient) > 0) throw limited(60);
        int previous = count(address);
        var old = attempts.get(address);
        attempts.put(address, new Attempt(previous + 1, old == null ? clock.instant().plusSeconds(900) : old.expires));
        if (operation.equals("send")) attempts.put(recipient, new Attempt(1, clock.instant().plusSeconds(60)));
    }
    private PasswordResetException limited(int seconds) {
        var error = new PasswordResetException(HttpStatus.TOO_MANY_REQUESTS, "PASSWORD_RESET_RATE_LIMITED", "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
        error.retryAfter = seconds;
        return error;
    }
}
