package com.f106.DIO.auth.domain;

import java.time.Instant;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@lombok.Getter
@Entity @Table(name = "signup_email_verifications")
public class EmailVerification implements org.springframework.data.domain.Persistable<String> {
    @Transient private boolean newRecord = true;
    @Id @Column(length = 255) private String email;
    @Column(nullable = false, columnDefinition = "char(64)") @JdbcTypeCode(SqlTypes.CHAR) private String codeHash;
    @Column(nullable = false) private Instant sentAt;
    @Column(nullable = false) private Instant expiresAt;
    @Column(nullable = false) private int failedAttempts;
    @Column(columnDefinition = "char(64)") @JdbcTypeCode(SqlTypes.CHAR) private String tokenHash;
    private Instant tokenExpiresAt;
    private Instant consumedAt;
    protected EmailVerification() {}
    public EmailVerification(String email) { this.email = email; }
    @Override public String getId() { return email; }
    @Override public boolean isNew() { return newRecord; }
    @PostLoad @PostPersist void markExisting() { newRecord = false; }
    public void issue(String hash, Instant now) {
        codeHash = hash; sentAt = now; expiresAt = now.plusSeconds(600);
        failedAttempts = 0; tokenHash = null; tokenExpiresAt = null; consumedAt = null;
    }

    public void recordFailure() { failedAttempts++; }
    public void authorizeSignup(String hash, Instant expiry) { tokenHash = hash; tokenExpiresAt = expiry; }
    public void consume(Instant now) { consumedAt = now; }
}
