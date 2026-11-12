package com.f106.DIO.push.service;

import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 푸시 변경은 인증 필터 통과 뒤에도 동일 트랜잭션에서 세션 행을 잠가 재검증한다. */
@Component
public class PushSessionLock {
    private final RefreshTokenRepository sessions;
    private final UserRepository users;
    public PushSessionLock(RefreshTokenRepository sessions, UserRepository users) {
        this.sessions = sessions;
        this.users = users;
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public RefreshToken lockActive(Jwt jwt) {
        final UUID sid;
        final long userId;
        try { sid = UUID.fromString(jwt.getClaimAsString("sid")); userId = Long.parseLong(jwt.getSubject()); }
        catch (RuntimeException error) { throw LoginException.token(); }
        // Account withdrawal holds the user row before revoking sessions. Preserve that order.
        users.findForPushRegistration(userId).filter(user -> user.isActive()).orElseThrow(LoginException::token);
        Long id = sessions.findIdBySessionId(sid).orElseThrow(LoginException::token);
        RefreshToken session = sessions.findForUpdate(id).orElseThrow(LoginException::token);
        if (!session.getSessionId().equals(sid) || session.getUserId() != userId || !session.active(Instant.now())) throw LoginException.token();
        return session;
    }
    public void assertActive(RefreshToken session) { if (!session.active(Instant.now())) throw LoginException.token(); }
}
