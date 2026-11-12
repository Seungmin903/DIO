package com.f106.DIO.auth.service;

import com.f106.DIO.auth.repository.RefreshTokenRepository;

import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LoginSessionRevoker {
    private final RefreshTokenRepository tokens;
    private final com.f106.DIO.push.service.PushSessionRevocation push;
    public LoginSessionRevoker(RefreshTokenRepository tokens, com.f106.DIO.push.service.PushSessionRevocation push) { this.tokens = tokens; this.push = push; }
    @Transactional(propagation = Propagation.MANDATORY)
    public void revokeAll(Long userId, Instant now) {
        // 모든 세션을 먼저 같은 순서로 잠근 뒤 기기를 잠가 계정 전환과 교착하지 않는다.
        var locked = new java.util.ArrayList<com.f106.DIO.auth.domain.RefreshToken>();
        for (Long id : tokens.findActiveIdsForUser(userId)) {
            var session = tokens.findForUpdate(id).orElse(null);
            if (session != null && session.getUserId().equals(userId) && session.getRevokedAt() == null) locked.add(session);
        }
        for (var session : locked) {
            push.revokeLockedSession(session.getSessionId(), userId, now);
            session.revoke(now);
        }
        // Withdrawal may delete refresh rows with JDBC immediately after this call.
        tokens.flush();
    }
}
