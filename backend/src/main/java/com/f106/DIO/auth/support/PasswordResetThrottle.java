package com.f106.DIO.auth.support;

import static com.f106.DIO.auth.domain.PasswordResetPolicy.*;

import com.f106.DIO.auth.exception.PasswordResetException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class PasswordResetThrottle {
    private record Attempt(int count, Instant expires) {}
    private record Expiry(String key, Instant expires) {}
    private static final int CAPACITY = 20000;
    private static final int RECLAIM_BATCH = 64;
    private final Clock clock;
    // 서로 다른 작업은 용량과 잠금을 공유하지 않는다. send의 recipients는 send 잠금으로 보호한다.
    private final Budget send = new Budget(), verify = new Budget(), complete = new Budget(), recipients = new Budget();
    public PasswordResetThrottle() { this(Clock.systemUTC()); }
    public PasswordResetThrottle(Clock clock) { this.clock = clock; }

    private static final class Budget {
        private final Map<String, Attempt> entries = new HashMap<>();
        private final PriorityQueue<Expiry> expiries = new PriorityQueue<>(Comparator.comparing(Expiry::expires));
        private void reclaim(Instant now) {
            // 전체 맵 순회 없이 만료 순서대로 요청당 최대 64개만 회수한다.
            for (int i=0; i<RECLAIM_BATCH && !expiries.isEmpty() && !now.isBefore(expiries.peek().expires); i++) {
                var expired=expiries.remove();
                var current=entries.get(expired.key);
                if (current != null && current.expires.equals(expired.expires)) entries.remove(expired.key);
            }
        }
        private Attempt active(String key, Instant now) {
            var value=entries.get(key);
            if (value != null && !now.isBefore(value.expires)) { entries.remove(key); return null; }
            return value;
        }
        private boolean hasRoom(String key) { return entries.containsKey(key) || entries.size()<CAPACITY; }
        private void increment(String key, Attempt previous, Instant now, long seconds) {
            Instant expiry=previous==null ? now.plusSeconds(seconds) : previous.expires;
            entries.put(key,new Attempt(previous==null ? 1 : previous.count+1,expiry));
            if (previous==null) expiries.add(new Expiry(key,expiry));
        }
    }

    public void check(String operation, String email, String ip) {
        Budget budget=switch(operation) { case "send" -> send; case "verify" -> verify; case "reset" -> complete; default -> throw new IllegalArgumentException("Unknown reset operation"); };
        String address=PasswordResetSecrets.hash(addressGroup(ip));
        String recipient=operation.equals("send") ? PasswordResetSecrets.hash(email) : null;
        synchronized (budget) {
            Instant now=clock.instant();
            budget.reclaim(now);
            var previous=budget.active(address,now);
            if (previous!=null && previous.count >= (budget==send ? MAX_SEND_REQUESTS : MAX_VERIFY_OR_RESET_REQUESTS)) throw limited(IP_WINDOW_SECONDS);
            if (budget==send) {
                recipients.reclaim(now);
                if (recipients.active(recipient,now)!=null) throw limited(RESEND_COOLDOWN_SECONDS);
                if (!recipients.hasRoom(recipient)) throw limited(RESEND_COOLDOWN_SECONDS);
            }
            if (!budget.hasRoom(address)) throw limited(RESEND_COOLDOWN_SECONDS);
            budget.increment(address,previous,now,IP_WINDOW_SECONDS);
            if (budget==send) recipients.increment(recipient,null,now,RESEND_COOLDOWN_SECONDS);
        }
    }

    private String addressGroup(String ip) {
        if (ip==null) return "unknown";
        String literal=ip.split("%",2)[0];
        if (literal.startsWith("[") && literal.endsWith("]")) literal=literal.substring(1,literal.length()-1);
        // 콜론이 포함된 숫자 리터럴만 파싱하므로 호스트명 DNS 조회를 하지 않는다.
        if (literal.contains(":") && literal.matches("[0-9a-fA-F:.]+")) {
            try {
                var parsed=InetAddress.getByName(literal);
                byte[] bytes=parsed.getAddress();
                return bytes.length==16 ? HexFormat.of().formatHex(bytes,0,8)+"/64" : parsed.getHostAddress();
            } catch (UnknownHostException ignored) { return "invalid-ip"; }
        }
        if (literal.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) {
            var octets=literal.split("\\.");
            for (int i=0;i<octets.length;i++) {
                int value=Integer.parseInt(octets[i]);
                if (value>255) return "invalid-ip";
                octets[i]=Integer.toString(value);
            }
            return String.join(".",octets);
        }
        return literal;
    }
    private PasswordResetException limited(int seconds) {
        var error=new PasswordResetException(HttpStatus.TOO_MANY_REQUESTS,"PASSWORD_RESET_RATE_LIMITED","요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
        error.retryAfter=seconds;
        return error;
    }
}
