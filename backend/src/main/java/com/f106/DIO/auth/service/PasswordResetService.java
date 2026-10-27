package com.f106.DIO.auth.service;

import static com.f106.DIO.auth.domain.PasswordResetPolicy.*;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.auth.domain.PasswordResetVerification;
import com.f106.DIO.auth.dto.PasswordResetRequest;
import com.f106.DIO.auth.dto.PasswordResetSentResponse;
import com.f106.DIO.auth.dto.PasswordResetVerificationRequest;
import com.f106.DIO.auth.dto.PasswordResetVerificationResponse;
import com.f106.DIO.auth.exception.PasswordResetException;
import com.f106.DIO.auth.infrastructure.mail.PasswordResetMailDispatch;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.repository.PasswordResetRepository;
import com.f106.DIO.auth.service.LoginSessionRevoker;
import com.f106.DIO.auth.support.PasswordResetSecrets;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;

import java.time.Instant;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordResetService {
    private final PasswordResetRepository resets;
    private final EmailAuthProviderRepository accounts;
    private final UserRepository users;
    private final SignupProperties properties;
    private final LoginSessionRevoker sessions;
    private final ApplicationEventPublisher events;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    public PasswordResetService(PasswordResetRepository resets, EmailAuthProviderRepository accounts, UserRepository users,
            SignupProperties properties, LoginSessionRevoker sessions, ApplicationEventPublisher events) {
        this.resets = resets; this.accounts = accounts; this.users = users; this.properties = properties;
        this.sessions = sessions; this.events = events;
    }
    @Transactional
    public PasswordResetSentResponse send(String email) {
        PasswordResetSecrets.configured(properties.verificationSecret());
        var response = new PasswordResetSentResponse("재설정 가능한 계정이면 인증 메일을 발송해요. 이미 받은 유효한 인증번호가 있다면 그 번호를 사용해 주세요.", CODE_TTL_SECONDS, RESEND_COOLDOWN_SECONDS);
        var account = accounts.findForUpdate("EMAIL", email).orElse(null);
        if (account == null || account.getPasswordHash() == null ||
                !users.findById(account.getUserId()).map(User::isActive).orElse(false)) return response;
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        var reset = resets.findForUpdate(email).orElseGet(() -> new PasswordResetVerification(email));
        // 이메일을 아는 제3자의 재발송 요청으로 진행 중인 인증·완료 토큰을 무효화하지 않는다.
        if (reset.getConsumedAt() == null && (
                (reset.getTokenHash() != null && reset.getTokenExpiresAt() != null && now.isBefore(reset.getTokenExpiresAt())) ||
                (reset.getTokenHash() == null && reset.getExpiresAt() != null && now.isBefore(reset.getExpiresAt()) && reset.getFailedAttempts() < MAX_FAILED_ATTEMPTS)))
            return response;
        // 서버 재시작/다중 인스턴스에서도 기존 메일을 연속 발송하지 않는다. 상태 코드·본문은 동일하나 처리 시간은 다를 수 있다.
        if (reset.getSentAt() != null && now.isBefore(reset.getSentAt().plusSeconds(RESEND_COOLDOWN_SECONDS))) return response;
        String code = PasswordResetSecrets.code();
        reset.issue(account.getUserId(), PasswordResetSecrets.codeHash(properties.verificationSecret(), email, code), now);
        resets.saveAndFlush(reset);
        events.publishEvent(new PasswordResetMailDispatch.Requested(email, code, reset.getCodeHash(), now));
        return response;
    }
    @Transactional(noRollbackFor = PasswordResetException.class)
    public PasswordResetVerificationResponse verify(PasswordResetVerificationRequest request) {
        var reset = resets.findForUpdate(request.email()).orElseThrow(PasswordResetException::invalid);
        Instant now = Instant.now();
        if (reset.getConsumedAt() != null || reset.getTokenHash() != null || reset.getFailedAttempts() >= MAX_FAILED_ATTEMPTS || !now.isBefore(reset.getExpiresAt()))
            throw PasswordResetException.invalid();
        if (!PasswordResetSecrets.matches(reset.getCodeHash(),
                PasswordResetSecrets.codeHash(properties.verificationSecret(), request.email(), request.code()))) {
            reset.recordFailure();
            throw PasswordResetException.invalid();
        }
        String token = PasswordResetSecrets.token();
        reset.authorize(PasswordResetSecrets.hash(token), now.plusSeconds(TOKEN_TTL_SECONDS));
        return new PasswordResetVerificationResponse(token, TOKEN_TTL_SECONDS);
    }
    @Transactional
    public void complete(PasswordResetRequest request) {
        // 로그인·재발송·재설정 모두 account -> verification -> session 순서로 잠근다.
        var account = accounts.findForUpdate("EMAIL", request.email()).orElseThrow(PasswordResetException::invalid);
        var reset = resets.findForUpdate(request.email()).orElseThrow(PasswordResetException::invalid);
        Instant now = Instant.now();
        if (!account.getUserId().equals(reset.getUserId()) || account.getPasswordHash() == null ||
                reset.getConsumedAt() != null || reset.getTokenExpiresAt() == null || !now.isBefore(reset.getTokenExpiresAt()) ||
                !PasswordResetSecrets.matches(reset.getTokenHash(), PasswordResetSecrets.hash(request.resetToken())) ||
                !users.findById(account.getUserId()).map(User::isActive).orElse(false)) throw PasswordResetException.invalid();
        account.resetPassword(passwords.encode(request.newPassword()));
        sessions.revokeAll(account.getUserId(), now);
        reset.consume(now);
    }
}
