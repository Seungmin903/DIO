package com.f106.DIO.auth.service;

import com.f106.DIO.auth.repository.EmailVerificationRepository;
import com.f106.DIO.auth.repository.PasswordResetRepository;
import java.time.Duration;
import java.time.Instant;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 인증번호와 후속 토큰이 모두 만료된 뒤 24시간 보존한다. 재발송·검증과 같은 행 잠금을 사용한다. */
@Service
public class ExpiredVerificationCleanup {
    private final EmailVerificationRepository signup;
    private final PasswordResetRepository reset;

    public ExpiredVerificationCleanup(EmailVerificationRepository signup, PasswordResetRepository reset) {
        this.signup = signup;
        this.reset = reset;
    }

    @Transactional
    public int purgeExpired() {
        Instant cutoff = Instant.now().minus(Duration.ofDays(1));
        var page = PageRequest.of(0, 500);
        int count = 0;
        for (String email : signup.findExpiredEmails(cutoff, page)) {
            var row = signup.findForUpdate(email).orElse(null);
            if (row != null && expired(row.getExpiresAt(), row.getTokenExpiresAt(), cutoff)) {
                signup.delete(row);
                count++;
            }
        }
        for (String email : reset.findExpiredEmails(cutoff, page)) {
            var row = reset.findForUpdate(email).orElse(null);
            if (row != null && expired(row.getExpiresAt(), row.getTokenExpiresAt(), cutoff)) {
                reset.delete(row);
                count++;
            }
        }
        return count;
    }

    private boolean expired(Instant codeExpiry, Instant tokenExpiry, Instant cutoff) {
        return codeExpiry.isBefore(cutoff) && (tokenExpiry == null || tokenExpiry.isBefore(cutoff));
    }
}
