package com.f106.DIO.auth.reset;

import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name = "password_reset_verifications")
class PasswordResetVerification {
    @Id @Column(length = 255) String email;
    @Column(nullable = false) Long userId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(nullable = false, columnDefinition = "char(64)") String codeHash;
    @Column(nullable = false) Instant sentAt;
    @Column(nullable = false) Instant expiresAt;
    @Column(nullable = false) int failedAttempts;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(unique = true, columnDefinition = "char(64)") String tokenHash;
    Instant tokenExpiresAt;
    Instant consumedAt;
    protected PasswordResetVerification() {}
    PasswordResetVerification(String email) { this.email = email; }
    void issue(Long userId, String hash, Instant now) {
        this.userId = userId; codeHash = hash; sentAt = now; expiresAt = now.plusSeconds(600);
        failedAttempts = 0; tokenHash = null; tokenExpiresAt = null; consumedAt = null;
    }
}
