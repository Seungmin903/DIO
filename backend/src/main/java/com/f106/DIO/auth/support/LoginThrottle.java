package com.f106.DIO.auth.support;

import com.f106.DIO.auth.exception.LoginException;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** 실패 횟수와 진행 중 검증을 함께 제한한다. 인스턴스 간 공통 제한은 인프라에서 적용한다. */
@Component
public class LoginThrottle {
    private static final int MAX_KEYS = 20000;
    private static final class Bucket {
        int failures;
        int inFlight;
        Instant expires;
        Bucket(Instant now) { expires = now.plusSeconds(900); }
    }
    public static final class Reservation {
        private final LoginThrottle owner;
        private final Bucket pair;
        private final Bucket address;
        private boolean completed;
        private Reservation(LoginThrottle owner, Bucket pair, Bucket address) {
            this.owner = owner; this.pair = pair; this.address = address;
        }
    }
    private final Clock clock;
    private final Map<String, Bucket> attempts = new LinkedHashMap<>(256, .75f, true);
    public LoginThrottle() { this(Clock.systemUTC()); }
    public LoginThrottle(Clock clock) { this.clock = clock; }
    private void rollWindow(Bucket bucket, Instant now) {
        if (!now.isBefore(bucket.expires)) {
            bucket.failures = 0; bucket.expires = now.plusSeconds(900);
            // 오래 진행 중인 검증도 계속 예산에 포함한다.
        }
    }
    public synchronized Reservation reserve(String email, String ip) {
        String pairKey = LoginSecrets.hash("pair:" + email + "\u0000" + ip);
        String ipKey = LoginSecrets.hash("ip:" + ip);
        Instant now = clock.instant();
        Bucket pair = attempts.get(pairKey), address = attempts.get(ipKey);
        int needed = (pair == null ? 1 : 0) + (address == null ? 1 : 0);
        if (pair == null) pair = new Bucket(now);
        if (address == null) address = new Bucket(now);
        rollWindow(pair, now); rollWindow(address, now);
        if (pair.failures + pair.inFlight >= 5 || address.failures + address.inFlight >= 100) throw limited();
        makeRoom(needed, pairKey, ipKey);
        attempts.put(pairKey, pair); attempts.put(ipKey, address);
        pair.inFlight++; address.inFlight++;
        return new Reservation(this, pair, address);
    }
    private void makeRoom(int needed, String pairKey, String ipKey) {
        var entries = attempts.entrySet().iterator();
        while (attempts.size() + needed > MAX_KEYS && entries.hasNext()) {
            var entry = entries.next();
            if (entry.getValue().inFlight == 0 && !entry.getKey().equals(pairKey) && !entry.getKey().equals(ipKey)) entries.remove();
        }
        // 진행 중인 예약을 캐시에서 제거해 제한이 사라지는 상황을 막는다.
        if (attempts.size() + needed > MAX_KEYS) throw limited();
    }
    public synchronized void failed(Reservation reservation) { finish(reservation, true, false); }
    public synchronized void success(Reservation reservation) { finish(reservation, false, true); }
    public synchronized void cancel(Reservation reservation) { finish(reservation, false, false); }
    private void finish(Reservation reservation, boolean failed, boolean success) {
        if (reservation == null || reservation.owner != this) throw new IllegalArgumentException("Invalid login reservation");
        if (reservation.completed) return;
        Instant now = clock.instant();
        rollWindow(reservation.pair, now); rollWindow(reservation.address, now);
        reservation.pair.inFlight--; reservation.address.inFlight--;
        if (failed) { reservation.pair.failures++; reservation.address.failures++; }
        if (success) reservation.pair.failures = 0;
        reservation.completed = true;
    }
    private LoginException limited() {
        return new LoginException(HttpStatus.TOO_MANY_REQUESTS, "LOGIN_RATE_LIMITED", "로그인 시도가 너무 많아요. 15분 후 다시 시도해 주세요.");
    }
}
