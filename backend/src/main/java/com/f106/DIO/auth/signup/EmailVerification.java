package com.f106.DIO.auth.signup;

import java.time.Instant;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name = "signup_email_verifications")
public class EmailVerification {
    @Id @Column(length = 255) String email;
    @Column(nullable = false, columnDefinition = "char(64)") @JdbcTypeCode(SqlTypes.CHAR) String codeHash;
    @Column(nullable = false) Instant sentAt;
    @Column(nullable = false) Instant expiresAt;
    @Column(nullable = false) int failedAttempts;
    @Column(columnDefinition = "char(64)") @JdbcTypeCode(SqlTypes.CHAR) String tokenHash;
    Instant tokenExpiresAt;
    Instant consumedAt;
    protected EmailVerification() {}
    EmailVerification(String email) { this.email = email; }
    void issue(String hash, Instant now) {
        codeHash = hash; sentAt = now; expiresAt = now.plusSeconds(600);
        failedAttempts = 0; tokenHash = null; tokenExpiresAt = null; consumedAt = null;
    }
}
