package com.f106.DIO.auth.support;

import com.f106.DIO.auth.exception.PasswordResetException;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class PasswordResetThrottle {
    private record Attempt(int count, Instant expires) {}
    private static final int CAPACITY = 20000;
    private final Clock clock;
    // IP 예산과 이메일 쿨다운을 분리하며, 유효한 항목은 축출하지 않는다.
    private final Map<String, Attempt> addresses = new HashMap<>();
    private final Map<String, Attempt> recipients = new HashMap<>();
    public PasswordResetThrottle() { this(Clock.systemUTC()); }
    public PasswordResetThrottle(Clock clock) { this.clock = clock; }
    private Attempt active(Map<String, Attempt> map, String key) {
        var value = map.get(key);
        if (value != null && !clock.instant().isBefore(value.expires)) { map.remove(key); return null; }
        return value;
    }
    private void requireRoom(Map<String, Attempt> map, String key) {
        if (map.containsKey(key) || map.size() < CAPACITY) return;
        map.values().removeIf(value -> !clock.instant().isBefore(value.expires));
        if (map.size() >= CAPACITY) throw limited(60);
    }
    public synchronized void check(String operation, String email, String ip) {
        String address = PasswordResetSecrets.hash(operation + ":ip:" + ip);
        String recipient = PasswordResetSecrets.hash("send:email:" + email);
        var budget = active(addresses, address);
        int previous = budget == null ? 0 : budget.count;
        if (previous >= (operation.equals("send") ? 20 : 100)) throw limited(900);
        if (operation.equals("send") && active(recipients, recipient) != null) throw limited(60);
        requireRoom(addresses, address);
        if (operation.equals("send")) requireRoom(recipients, recipient);
        addresses.put(address, new Attempt(previous + 1, budget == null ? clock.instant().plusSeconds(900) : budget.expires));
        if (operation.equals("send")) recipients.put(recipient, new Attempt(1, clock.instant().plusSeconds(60)));
    }
    private PasswordResetException limited(int seconds) {
        var error = new PasswordResetException(HttpStatus.TOO_MANY_REQUESTS, "PASSWORD_RESET_RATE_LIMITED", "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
        error.retryAfter = seconds;
        return error;
    }
}
