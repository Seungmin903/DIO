package com.f106.DIO.auth.reset;

import java.time.Instant;
import com.f106.DIO.auth.signup.*;
import com.f106.DIO.auth.login.LoginSessionRevoker;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class PasswordResetService {
    private final PasswordResetRepository resets;
    private final EmailAuthProviderRepository accounts;
    private final SignupUserRepository users;
    private final SignupProperties properties;
    private final LoginSessionRevoker sessions;
    private final ApplicationEventPublisher events;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    PasswordResetService(PasswordResetRepository resets, EmailAuthProviderRepository accounts, SignupUserRepository users,
            SignupProperties properties, LoginSessionRevoker sessions, ApplicationEventPublisher events) {
        this.resets = resets; this.accounts = accounts; this.users = users; this.properties = properties;
        this.sessions = sessions; this.events = events;
    }
    @Transactional
    public PasswordResetDtos.SentResponse send(String email) {
        PasswordResetSecrets.configured(properties.verificationSecret());
        var response = new PasswordResetDtos.SentResponse("재설정 가능한 계정이면 인증 메일을 발송해요. 메일함을 확인해 주세요.", 600, 60);
        var account = accounts.findForUpdate("EMAIL", email).orElse(null);
        if (account == null || account.getPasswordHash() == null ||
                !users.findById(account.getUserId()).map(SignupUser::isActive).orElse(false)) return response;
        Instant now = Instant.now();
        var reset = resets.findForUpdate(email).orElseGet(() -> new PasswordResetVerification(email));
        // 서버 재시작/다중 인스턴스에서도 기존 메일을 연속 발송하지 않는다. 응답은 항상 동일하다.
        if (reset.sentAt != null && now.isBefore(reset.sentAt.plusSeconds(60))) return response;
        String code = PasswordResetSecrets.code();
        reset.issue(account.getUserId(), PasswordResetSecrets.codeHash(properties.verificationSecret(), email, code), now);
        resets.saveAndFlush(reset);
        events.publishEvent(new PasswordResetMailDispatch.Requested(email, code));
        return response;
    }
    @Transactional(noRollbackFor = PasswordResetException.class)
    public PasswordResetDtos.VerifiedResponse verify(PasswordResetDtos.VerifyRequest request) {
        var reset = resets.findForUpdate(request.email()).orElseThrow(PasswordResetException::invalid);
        Instant now = Instant.now();
        if (reset.consumedAt != null || reset.tokenHash != null || reset.failedAttempts >= 5 || !now.isBefore(reset.expiresAt))
            throw PasswordResetException.invalid();
        if (!PasswordResetSecrets.matches(reset.codeHash,
                PasswordResetSecrets.codeHash(properties.verificationSecret(), request.email(), request.code()))) {
            reset.failedAttempts++;
            throw PasswordResetException.invalid();
        }
        String token = PasswordResetSecrets.token();
        reset.tokenHash = PasswordResetSecrets.hash(token); reset.tokenExpiresAt = now.plusSeconds(600);
        return new PasswordResetDtos.VerifiedResponse(token, 600);
    }
    @Transactional
    public void complete(PasswordResetDtos.ResetRequest request) {
        // 로그인·재발송·재설정 모두 account -> verification -> session 순서로 잠근다.
        var account = accounts.findForUpdate("EMAIL", request.email()).orElseThrow(PasswordResetException::invalid);
        var reset = resets.findForUpdate(request.email()).orElseThrow(PasswordResetException::invalid);
        Instant now = Instant.now();
        if (!account.getUserId().equals(reset.userId) || account.getPasswordHash() == null ||
                reset.consumedAt != null || reset.tokenExpiresAt == null || !now.isBefore(reset.tokenExpiresAt) ||
                !PasswordResetSecrets.matches(reset.tokenHash, PasswordResetSecrets.hash(request.resetToken())) ||
                !users.findById(account.getUserId()).map(SignupUser::isActive).orElse(false)) throw PasswordResetException.invalid();
        account.resetPassword(passwords.encode(request.newPassword()));
        sessions.revokeAll(account.getUserId(), now);
        reset.consumedAt = now;
    }
}
