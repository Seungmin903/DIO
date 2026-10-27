package com.f106.DIO.auth.service;

import com.f106.DIO.auth.repository.PasswordResetRepository;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 기존 인증 행만 갱신한다. 새 인증·완료 토큰·소비된 인증에는 영향을 주지 않는다. */
@Service
public class PasswordResetDeliveryFailureTracker {
    private final PasswordResetRepository resets;
    public PasswordResetDeliveryFailureTracker(PasswordResetRepository resets) { this.resets = resets; }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(String email, String hash, Instant issuedAt) {
        resets.expireFailedDelivery(email, hash, issuedAt, Instant.now());
    }
}
