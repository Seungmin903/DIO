package com.f106.DIO.auth.login;

import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LoginSessionRevoker {
    private final RefreshTokenRepository tokens;
    public LoginSessionRevoker(RefreshTokenRepository tokens) { this.tokens = tokens; }
    @Transactional(propagation = Propagation.MANDATORY)
    public void revokeAll(Long userId, Instant now) { tokens.revokeAllForUser(userId, now); }
}
