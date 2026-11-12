package com.f106.DIO.auth.service;

import static com.f106.DIO.auth.domain.SignupVerificationPolicy.*;

import com.f106.DIO.auth.dto.EmailVerificationRequest;
import com.f106.DIO.auth.dto.EmailVerificationResponse;
import com.f106.DIO.auth.dto.EmailVerificationSentResponse;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.auth.domain.EmailVerification;
import com.f106.DIO.auth.exception.SignupException;
import com.f106.DIO.auth.infrastructure.mail.SignupMailSender;
import com.f106.DIO.auth.repository.EmailVerificationRepository;
import com.f106.DIO.auth.support.SignupSecrets;
import com.f106.DIO.user.repository.UserRepository;

import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmailVerificationService {
    private static final long RESEND_SECONDS = 60;
    private final EmailVerificationRepository verifications;
    private final UserRepository users;
    private final SignupMailSender mail;
    private final SignupProperties properties;
    public EmailVerificationService(EmailVerificationRepository verifications, UserRepository users,
                                    SignupMailSender mail, SignupProperties properties) {
        this.verifications = verifications; this.users = users; this.mail = mail; this.properties = properties;
    }
    @Transactional
    public EmailVerificationSentResponse send(String email) {
        if (users.existsByEmail(email)) throw SignupException.conflict("EMAIL_ALREADY_REGISTERED", "이미 가입된 이메일이에요.");
        EmailVerification verification = verifications.findForUpdate(email).orElseGet(() -> new EmailVerification(email));
        Instant now = Instant.now();
        if (verification.getSentAt() != null && now.isBefore(verification.getSentAt().plusSeconds(RESEND_SECONDS))) {
            long remainingMillis = java.time.Duration.between(now, verification.getSentAt().plusSeconds(RESEND_SECONDS)).toMillis();
            throw rateLimited(Math.max(1, (remainingMillis + 999) / 1000));
        }
        String code = SignupSecrets.code();
        verification.issue(SignupSecrets.codeHash(properties.verificationSecret(), email, code), now);
        boolean creating = verification.isNew();
        try { verifications.saveAndFlush(verification); }
        catch (org.springframework.dao.DataIntegrityViolationException error) {
            // 최초 행은 merge 대신 INSERT한다. 경쟁 INSERT의 PK 충돌만 429로 응답하고
            // 현재 트랜잭션은 그대로 롤백한다. 다른 무결성 오류는 기존 500 처리를 유지한다.
            for (Throwable cause = error; cause != null; cause = cause.getCause()) {
                if (creating && cause instanceof java.sql.SQLException sql && "23505".equals(sql.getSQLState())) throw rateLimited(RESEND_SECONDS);
            }
            throw error;
        }
        mail.send(email, code);
        return new EmailVerificationSentResponse(CODE_TTL_SECONDS, RESEND_SECONDS);
    }
    // 오답 횟수는 오류 응답이어도 커밋해 재요청으로 제한이 초기화되지 않게 한다.
    @Transactional(noRollbackFor = SignupException.class)
    public EmailVerificationResponse verify(EmailVerificationRequest request) {
        EmailVerification verification = verifications.findForUpdate(request.email()).orElseThrow(() -> invalid());
        Instant now = Instant.now();
        if (verification.getConsumedAt() != null || verification.getTokenHash() != null || !now.isBefore(verification.getExpiresAt())) throw invalid();
        // 기다려도 같은 번호로는 풀리지 않으므로 Retry-After 없이 새 번호 요청을 안내한다.
        if (verification.getFailedAttempts() >= 5) throw new SignupException(HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_ATTEMPTS_EXCEEDED", "새 인증번호를 요청해 주세요.");
        if (!SignupSecrets.matches(verification.getCodeHash(), SignupSecrets.codeHash(properties.verificationSecret(), request.email(), request.code()))) {
            verification.recordFailure();
            throw invalid();
        }
        String token = SignupSecrets.token();
        verification.authorizeSignup(SignupSecrets.tokenHash(token), now.plusSeconds(SIGNUP_TOKEN_TTL_SECONDS));
        return new EmailVerificationResponse(token, SIGNUP_TOKEN_TTL_SECONDS);
    }
    private SignupException invalid() { return SignupException.invalid("INVALID_VERIFICATION_CODE", "인증번호가 유효하지 않아요. 다시 확인하거나 새로 요청해 주세요."); }
    private SignupException rateLimited(long retryAfterSeconds) {
        return new SignupException(HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_RATE_LIMITED",
            "인증번호는 " + retryAfterSeconds + "초 후 다시 요청해 주세요.", retryAfterSeconds);
    }
}
