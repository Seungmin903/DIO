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
    private static final int MAX_KEYS=20000, ACTOR_LIMIT=20, ACTOR_WINDOW_SECONDS=60;
    private record Key(UUID diary,String digest) {}
    private static final class Window {
        final Instant expiresAt;int attempts=1;
        Window(Instant now,long seconds){expiresAt=now.plusSeconds(seconds);}
    }
    private final Map<Key,Window> windows=new LinkedHashMap<>(128,0.75f,true);
    private final Map<Long,Window> actors=new LinkedHashMap<>(128,0.75f,true);
    private Instant nextSweep=Instant.MIN;

    public synchronized void reserve(UUID diary,long actor,String email,Instant now) {
        if(!now.isBefore(nextSweep)) {
            windows.values().removeIf(window->!window.expiresAt.isAfter(now));
            actors.values().removeIf(window->!window.expiresAt.isAfter(now));
            nextSweep=now.plusSeconds(1);
        }
        var caller=actors.get(actor);
        if(caller!=null&&!caller.expiresAt.isAfter(now)){actors.remove(actor);caller=null;}
        if(caller==null){makeRoom(actors);actors.put(actor,new Window(now,ACTOR_WINDOW_SECONDS));}
        else {
            if(caller.attempts>=ACTOR_LIMIT)throw new SharingException(HttpStatus.TOO_MANY_REQUESTS,
                "EMAIL_INVITE_ACTOR_RATE_LIMITED","이메일 초대 요청이 많아요. 잠시 후 다시 시도해 주세요.",retry(caller,now));
            caller.attempts++;
        }
        final String digest;
        try {digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
            .digest(email.strip().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}
        var key=new Key(diary,digest);var window=windows.get(key);
        if(window!=null&&!window.expiresAt.isAfter(now)){windows.remove(key);window=null;}
        if(window==null) {
            makeRoom(windows);
            windows.put(key,new Window(now,SharingPolicy.INVITE_WINDOW_SECONDS));return;
        }
        if(window.attempts>=SharingPolicy.MAX_INVITES)throw limited(retry(window,now));
        window.attempts++;
    }
    private long retry(Window window,Instant now){return Math.max(1,(java.time.Duration.between(now,window.expiresAt).toMillis()+999)/1000);}
    private <K> void makeRoom(Map<K,Window> cache) {
        // LRU eviction affects only best-effort request windows. The database still enforces actual send quotas.
        if(cache.size()>=MAX_KEYS){var oldest=cache.keySet().iterator();oldest.next();oldest.remove();}
    }
    private SharingException limited(long retry) {
        return new SharingException(HttpStatus.TOO_MANY_REQUESTS,"EMAIL_INVITE_RATE_LIMITED",
            "같은 다이어리와 이메일의 초대 요청은 5분에 3회까지 가능해요.",retry);
    }
}
