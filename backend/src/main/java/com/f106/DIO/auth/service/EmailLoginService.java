package com.f106.DIO.auth.service;

import com.f106.DIO.auth.dto.LoginRequest;
import com.f106.DIO.auth.dto.LoginResponse;
import com.f106.DIO.auth.dto.LoginUserResponse;

import com.f106.DIO.auth.config.LoginProperties;
import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.domain.RefreshTokenHistory;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.repository.RefreshTokenHistoryRepository;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.support.LoginSecrets;
import com.f106.DIO.auth.support.LoginThrottle;
import com.f106.DIO.user.domain.ProfilePhoto;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.repository.UserRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
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
    private final ProfilePhotoRepository photos;
    private final RefreshTokenRepository tokens;
    private final RefreshTokenHistoryRepository history;
    private final LoginJwt jwt;
    private final LoginProperties properties;
    private final LoginThrottle throttle;
    private final TransactionTemplate readTransaction;
    private final TransactionTemplate writeTransaction;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    private final String dummyHash = passwords.encode("dummy-password-never-authenticates");
    public EmailLoginService(UserRepository users, EmailAuthProviderRepository accounts, ProfilePhotoRepository photos,
            RefreshTokenRepository tokens, RefreshTokenHistoryRepository history, LoginJwt jwt, LoginProperties properties,
            LoginThrottle throttle, PlatformTransactionManager transactionManager) {
        this.users = users; this.accounts = accounts; this.photos = photos; this.tokens = tokens;
        this.history = history; this.jwt = jwt; this.properties = properties; this.throttle = throttle;
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
                String refresh = LoginSecrets.refresh();
                var token = new RefreshToken(user.getUserId(), LoginSecrets.hash(refresh), request.deviceName(), now,
                    now.plusSeconds(properties.refreshSeconds()));
                LoginResponse result = response(user, token, refresh, now);
                tokens.saveAndFlush(token);
                user.recordLogin(now);
                return result;
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
        if (!token.active(now)) throw LoginException.token();
        if (!LoginSecrets.matches(hash, token.getTokenHash())) {
            token.revoke(now); throw LoginException.token();
        }
        User user = users.findById(token.getUserId()).orElse(null);
        if (user == null || !user.isActive()) { token.revoke(now); throw LoginException.token(); }
        String nextRefresh = LoginSecrets.refresh();
        // 설정/서명 실패 전에 기존 토큰을 소비하지 않는다.
        LoginResponse response = response(user, token, nextRefresh, now);
        history.saveAndFlush(new RefreshTokenHistory(token, now));
        token.rotate(LoginSecrets.hash(nextRefresh));
        tokens.saveAndFlush(token);
        return response;
    }
    private LoginResponse response(User user, RefreshToken session, String refresh, Instant now) {
        Instant expiry = now.plusSeconds(properties.accessSeconds());
        if (session.getExpiresAt().isBefore(expiry)) expiry = session.getExpiresAt();
        String access = jwt.issue(user.getUserId(), session.getSessionId(), now, expiry);
        String photo = photos.findByUserId(user.getUserId()).map(ProfilePhoto::url).orElse(null);
        return new LoginResponse("Bearer", access, Duration.between(now, expiry).getSeconds(), refresh,
            Duration.between(now, session.getExpiresAt()).getSeconds(),
            new LoginUserResponse(user.getUserId().toString(), user.getEmail(), user.getNickname(), photo));
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
        token.revoke(Instant.now());
    }
}
