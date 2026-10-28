package com.f106.DIO.sharing.support;

import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.domain.SharingPolicy;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Response throttling is independent of recipient existence; no email addresses are retained. */
@Component
public class EmailInviteAttemptThrottle {
    private static final int MAX_KEYS=20000;
    private record Key(UUID diary,String digest) {}
    private static final class Window {
        final Instant expiresAt;int attempts=1;
        Window(Instant now){expiresAt=now.plusSeconds(SharingPolicy.INVITE_WINDOW_SECONDS);}
    }
    private final Map<Key,Window> windows=new HashMap<>();
    private Instant nextSweep=Instant.MIN;

    public synchronized void reserve(UUID diary,String email,Instant now) {
        final String digest;
        try {digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
            .digest(email.strip().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}
        if(!now.isBefore(nextSweep)) {
            windows.values().removeIf(window->!window.expiresAt.isAfter(now));
            nextSweep=now.plusSeconds(1);
        }
        var key=new Key(diary,digest);var window=windows.get(key);
        if(window!=null&&!window.expiresAt.isAfter(now)){windows.remove(key);window=null;}
        if(window==null) {
            if(windows.size()>=MAX_KEYS)throw limited(1);
            windows.put(key,new Window(now));return;
        }
        if(window.attempts>=SharingPolicy.MAX_INVITES)throw limited(Math.max(1,(java.time.Duration.between(now,window.expiresAt).toMillis()+999)/1000));
        window.attempts++;
    }
    private SharingException limited(long retry) {
        return new SharingException(HttpStatus.TOO_MANY_REQUESTS,"EMAIL_INVITE_RATE_LIMITED",
            "같은 다이어리와 이메일의 초대 요청은 5분에 3회까지 가능해요.",retry);
    }
}
