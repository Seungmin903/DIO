package com.f106.DIO.auth.signup;

import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmailVerificationService {
    private final EmailVerificationRepository verifications;
    private final SignupUserRepository users;
    private final SignupMailSender mail;
    private final SignupProperties properties;
    public EmailVerificationService(EmailVerificationRepository verifications, SignupUserRepository users,
                                    SignupMailSender mail, SignupProperties properties) {
        this.verifications = verifications; this.users = users; this.mail = mail; this.properties = properties;
    }
    @Transactional
    public SignupDtos.SentResponse send(String email) {
        if (users.existsByEmail(email)) throw SignupException.conflict("EMAIL_ALREADY_REGISTERED", "이미 가입된 이메일이에요.");
        Instant now = Instant.now();
        EmailVerification verification = verifications.findForUpdate(email).orElseGet(() -> new EmailVerification(email));
        if (verification.sentAt != null && now.isBefore(verification.sentAt.plusSeconds(60))) {
            throw new SignupException(HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_RATE_LIMITED", "인증번호는 60초 후 다시 요청해 주세요.");
        }
        String code = SignupSecrets.code();
        verification.issue(SignupSecrets.codeHash(properties.verificationSecret(), email, code), now);
        verifications.saveAndFlush(verification);
        mail.send(email, code);
        return new SignupDtos.SentResponse(600, 60);
    }
    // 오답 횟수는 오류 응답이어도 커밋해 재요청으로 제한이 초기화되지 않게 한다.
    @Transactional(noRollbackFor = SignupException.class)
    public SignupDtos.VerifiedResponse verify(SignupDtos.VerifyRequest request) {
        EmailVerification verification = verifications.findForUpdate(request.email()).orElseThrow(() -> invalid());
        Instant now = Instant.now();
        if (verification.consumedAt != null || verification.tokenHash != null || !now.isBefore(verification.expiresAt)) throw invalid();
        if (verification.failedAttempts >= 5) throw new SignupException(HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_ATTEMPTS_EXCEEDED", "새 인증번호를 요청해 주세요.");
        if (!SignupSecrets.matches(verification.codeHash, SignupSecrets.codeHash(properties.verificationSecret(), request.email(), request.code()))) {
            verification.failedAttempts++;
            throw invalid();
        }
        String token = SignupSecrets.token();
        verification.tokenHash = SignupSecrets.tokenHash(token);
        verification.tokenExpiresAt = now.plusSeconds(600);
        return new SignupDtos.VerifiedResponse(token, 600);
    }
    private SignupException invalid() { return SignupException.invalid("INVALID_VERIFICATION_CODE", "인증번호가 유효하지 않아요. 다시 확인하거나 새로 요청해 주세요."); }
}
