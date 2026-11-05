package com.f106.DIO.auth.service;

import com.f106.DIO.auth.dto.LoginRequest;
import com.f106.DIO.auth.dto.LoginResponse;

import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.domain.RefreshTokenHistory;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.repository.RefreshTokenHistoryRepository;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.support.LoginSecrets;
import com.f106.DIO.auth.support.LoginThrottle;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;

import java.time.Instant;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class EmailLoginService {
    private final UserRepository users;
    private final EmailAuthProviderRepository accounts;
    private final LoginSessionService sessions;
    private final RefreshTokenRepository tokens;
    private final RefreshTokenHistoryRepository history;
    private final LoginJwt jwt;
    private final com.f106.DIO.auth.support.RefreshRotation rotation;
    private final LoginThrottle throttle;
    private final TransactionTemplate readTransaction;
    private final TransactionTemplate writeTransaction;
    private final PasswordEncoder passwords;
    private final String dummyHash;
    private final com.f106.DIO.push.service.PushSessionRevocation pushRevocation;
    public EmailLoginService(UserRepository users, EmailAuthProviderRepository accounts, LoginSessionService sessions,
            RefreshTokenRepository tokens, RefreshTokenHistoryRepository history, LoginJwt jwt,
            LoginThrottle throttle, PlatformTransactionManager transactionManager,
            com.f106.DIO.auth.support.RefreshRotation rotation,
            com.f106.DIO.push.service.PushSessionRevocation pushRevocation,
            @Qualifier("authPasswordEncoder") PasswordEncoder passwords) {
        this.pushRevocation = pushRevocation;
        this.rotation = rotation;
        this.passwords = passwords;
        this.dummyHash = passwords.encode("dummy-password-never-authenticates");
        this.users = users; this.accounts = accounts; this.sessions = sessions; this.tokens = tokens;
        this.history = history; this.jwt = jwt; this.throttle = throttle;
        readTransaction = new TransactionTemplate(transactionManager);
        readTransaction.setReadOnly(true);
        writeTransaction = new TransactionTemplate(transactionManager);
    }
    // 외부 트랜잭션으로 감싸 커넥션이 BCrypt 동안 유지되는 호출도 허용하지 않는다.
    @Transactional(propagation = Propagation.NEVER)
    public LoginResponse login(LoginRequest request, String remoteAddress) {
        jwt.configured();
        var reservation = throttle.reserve(request.email(), remoteAddress);
        try {
            var account = readTransaction.execute(status ->
                accounts.findByProviderAndProviderUserId("EMAIL", request.email()).orElse(null));
            String hash = account == null || account.getPasswordHash() == null ? dummyHash : account.getPasswordHash();
            boolean matches = passwords.matches(request.password(), hash);
            if (!matches || account == null || account.getPasswordHash() == null) {
                throw LoginException.credentials();
            }
            LoginResponse response = writeTransaction.execute(status -> {
                // BCrypt 이후 비밀번호가 바뀌었다면 이전 비밀번호로 세션을 만들지 않는다.
                var current = accounts.findForUpdate("EMAIL", request.email()).orElseThrow(LoginException::credentials);
                if (!current.getUserId().equals(account.getUserId()) || !hash.equals(current.getPasswordHash()))
                    throw LoginException.credentials();
                User user = users.findById(current.getUserId()).filter(User::isActive)
                    .orElseThrow(LoginException::credentials);
                Instant now = Instant.now();
                return sessions.create(user, request.deviceName(), now);
            });
            throttle.success(reservation);
            return response;
        } catch (LoginException error) {
            if ("INVALID_CREDENTIALS".equals(error.code)) throttle.failed(reservation);
            throw error;
        } finally {
            // DB·서명 등 시스템 오류도 진행 중 예산을 영구 점유하지 않게 한다.
            throttle.cancel(reservation);
        }
    }
    @Transactional(noRollbackFor = LoginException.class)
    public LoginResponse refresh(String refresh) {
        String hash = LoginSecrets.hash(refresh);
        Long id = tokens.findIdByTokenHash(hash)
            .orElseGet(() -> history.findById(hash).map(t -> t.getTokenId()).orElseThrow(LoginException::token));
        // 고정 세션 행을 잠가 재발급/로그아웃/재사용 감지를 직렬화한다.
        RefreshToken token = tokens.findForUpdate(id).orElseThrow(LoginException::token);
        Instant now = Instant.now();
        if (!token.active(now) || !now.isBefore(token.getCreatedAt().plus(java.time.Duration.ofDays(90))))
            throw LoginException.token();
        User user = users.findById(token.getUserId()).orElse(null);
        if (user == null || !user.isActive()) { pushRevocation.revokeLockedSession(token.getSessionId(), token.getUserId(), now); token.revoke(now); throw LoginException.token(); }
        var previous = history.findFirstByTokenIdOrderByRotatedAtDesc(token.getTokenId()).orElse(null);
        boolean grace = previous != null && rotation.withinGrace(previous.getRotatedAt(), now);
        if (!LoginSecrets.matches(hash, token.getTokenHash())) {
            // Fixed, non-sliding window: only the immediately preceding token can recover its successor.
            if (grace && LoginSecrets.matches(hash, previous.getTokenHash())) {
                String successor = rotation.successor(refresh, token.getSessionId());
                if (LoginSecrets.matches(LoginSecrets.hash(successor), token.getTokenHash()))
                    return sessions.response(user, token, successor, now);
            }
            pushRevocation.revokeLockedSession(token.getSessionId(), token.getUserId(), now);
            token.revoke(now); throw LoginException.token();
        }
        // Freeze the current token during this window, so concurrent current/previous requests converge.
        if (grace) return sessions.response(user, token, refresh, now);
        String nextRefresh = rotation.successor(refresh, token.getSessionId());
        Instant nextExpiry = sessions.refreshedExpiry(token, now);
        // Build/sign before modifying persistence: configuration failures must not consume a token.
        LoginResponse response = sessions.response(user, token, nextRefresh, now, nextExpiry);
        history.saveAndFlush(new RefreshTokenHistory(token, now));
        token.rotate(LoginSecrets.hash(nextRefresh));
        token.extendUntil(nextExpiry);
        tokens.saveAndFlush(token);
        return response;
    }
    @Transactional(readOnly = true)
    public boolean active(Jwt access) {
        try {
            UUID sid = UUID.fromString(access.getClaimAsString("sid"));
            Long userId = Long.valueOf(access.getSubject());
            return tokens.findBySessionId(sid).filter(t -> t.getUserId().equals(userId) && t.active(Instant.now())).isPresent()
                && users.findById(userId).filter(User::isActive).isPresent();
        } catch (IllegalArgumentException | NullPointerException error) { return false; }
    }
    @Transactional
    public void logout(Jwt access) {
        UUID sid = UUID.fromString(access.getClaimAsString("sid"));
        Long id = tokens.findIdBySessionId(sid).orElseThrow(LoginException::token);
        RefreshToken token = tokens.findForUpdate(id).orElseThrow(LoginException::token);
        if (!token.active(Instant.now()) || !token.getUserId().toString().equals(access.getSubject())) throw LoginException.token();
        Instant now = Instant.now();
        pushRevocation.revokeLockedSession(token.getSessionId(), token.getUserId(), now);
        token.revoke(now);
    }
}
