package com.f106.DIO.auth.login;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import com.f106.DIO.auth.signup.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class EmailLoginService {
    private final SignupUserRepository users;
    private final EmailAuthProviderRepository accounts;
    private final SignupProfilePhotoRepository photos;
    private final RefreshTokenRepository tokens;
    private final RefreshTokenHistoryRepository history;
    private final LoginJwt jwt;
    private final LoginProperties properties;
    private final LoginThrottle throttle;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    private final String dummyHash = passwords.encode("dummy-password-never-authenticates");
    EmailLoginService(SignupUserRepository users, EmailAuthProviderRepository accounts, SignupProfilePhotoRepository photos,
            RefreshTokenRepository tokens, RefreshTokenHistoryRepository history, LoginJwt jwt, LoginProperties properties, LoginThrottle throttle) {
        this.users = users; this.accounts = accounts; this.photos = photos; this.tokens = tokens;
        this.history = history; this.jwt = jwt; this.properties = properties; this.throttle = throttle;
    }
    @Transactional
    public LoginDtos.Tokens login(LoginDtos.LoginRequest request, String remoteAddress) {
        throttle.check(request.email(), remoteAddress);
        jwt.configured();
        var account = accounts.findByProviderAndProviderUserId("EMAIL", request.email()).orElse(null);
        String hash = account == null || account.getPasswordHash() == null ? dummyHash : account.getPasswordHash();
        boolean matches = passwords.matches(request.password(), hash);
        SignupUser user = account == null ? null : users.findById(account.getUserId()).orElse(null);
        if (!matches || account == null || account.getPasswordHash() == null || user == null || !user.isActive()) {
            throttle.failed(request.email(), remoteAddress); throw LoginException.credentials();
        }
        Instant now = Instant.now();
        String refresh = LoginSecrets.refresh();
        var token = new RefreshToken(user.getUserId(), LoginSecrets.hash(refresh), request.deviceName(), now,
            now.plusSeconds(properties.refreshSeconds()));
        LoginDtos.Tokens response = response(user, token, refresh, now);
        tokens.saveAndFlush(token);
        user.recordLogin(now);
        throttle.success(request.email(), remoteAddress);
        return response;
    }
    @Transactional(noRollbackFor = LoginException.class)
    public LoginDtos.Tokens refresh(String refresh) {
        String hash = LoginSecrets.hash(refresh);
        Long id = tokens.findIdByTokenHash(hash)
            .orElseGet(() -> history.findById(hash).map(t -> t.tokenId).orElseThrow(LoginException::token));
        // 고정 세션 행을 잠가 재발급/로그아웃/재사용 감지를 직렬화한다.
        RefreshToken token = tokens.findForUpdate(id).orElseThrow(LoginException::token);
        Instant now = Instant.now();
        if (!token.active(now)) throw LoginException.token();
        if (!LoginSecrets.matches(hash, token.tokenHash)) {
            token.revokedAt = now; throw LoginException.token();
        }
        SignupUser user = users.findById(token.userId).orElse(null);
        if (user == null || !user.isActive()) { token.revokedAt = now; throw LoginException.token(); }
        String nextRefresh = LoginSecrets.refresh();
        // 설정/서명 실패 전에 기존 토큰을 소비하지 않는다.
        LoginDtos.Tokens response = response(user, token, nextRefresh, now);
        history.saveAndFlush(new RefreshTokenHistory(token, now));
        token.tokenHash = LoginSecrets.hash(nextRefresh);
        tokens.saveAndFlush(token);
        return response;
    }
    private LoginDtos.Tokens response(SignupUser user, RefreshToken session, String refresh, Instant now) {
        Instant expiry = now.plusSeconds(properties.accessSeconds());
        if (session.expiresAt.isBefore(expiry)) expiry = session.expiresAt;
        String access = jwt.issue(user.getUserId(), session.sessionId, now, expiry);
        String photo = photos.findByUserId(user.getUserId()).map(SignupProfilePhoto::url).orElse(null);
        return new LoginDtos.Tokens("Bearer", access, Duration.between(now, expiry).getSeconds(), refresh,
            Duration.between(now, session.expiresAt).getSeconds(),
            new LoginDtos.User(user.getUserId().toString(), user.getEmail(), user.getNickname(), photo));
    }
    @Transactional(readOnly = true)
    public boolean active(Jwt access) {
        try {
            UUID sid = UUID.fromString(access.getClaimAsString("sid"));
            Long userId = Long.valueOf(access.getSubject());
            return tokens.findBySessionId(sid).filter(t -> t.userId.equals(userId) && t.active(Instant.now())).isPresent()
                && users.findById(userId).filter(SignupUser::isActive).isPresent();
        } catch (IllegalArgumentException | NullPointerException error) { return false; }
    }
    @Transactional
    public void logout(Jwt access) {
        UUID sid = UUID.fromString(access.getClaimAsString("sid"));
        Long id = tokens.findIdBySessionId(sid).orElseThrow(LoginException::token);
        RefreshToken token = tokens.findForUpdate(id).orElseThrow(LoginException::token);
        if (!token.active(Instant.now()) || !token.userId.toString().equals(access.getSubject())) throw LoginException.token();
        token.revokedAt = Instant.now();
    }
}
