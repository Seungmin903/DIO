package com.f106.DIO.auth.domain;

import static com.f106.DIO.auth.domain.PasswordResetPolicy.*;



import jakarta.persistence.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@lombok.Getter
@Entity @Table(name = "password_reset_verifications")
public class PasswordResetVerification {
    @Id @Column(length = 255) private String email;
    @Column(nullable = false) private Long userId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(nullable = false, columnDefinition = "char(64)") private String codeHash;
    @Column(nullable = false) private Instant sentAt;
    @Column(nullable = false) private Instant expiresAt;
    @Column(nullable = false) private int failedAttempts;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(unique = true, columnDefinition = "char(64)") private String tokenHash;
    private Instant tokenExpiresAt;
    private Instant consumedAt;
    public void recordFailure() { failedAttempts++; }
    public void authorize(String hash, Instant expires) { tokenHash = hash; tokenExpiresAt = expires; }
    public void consume(Instant now) { consumedAt = now; }
    protected PasswordResetVerification() {}
    public PasswordResetVerification(String email) { this.email = email; }
    public void issue(Long userId, String hash, Instant now) {
        this.userId = userId; codeHash = hash; sentAt = now; expiresAt = now.plusSeconds(CODE_TTL_SECONDS);
        failedAttempts = 0; tokenHash = null; tokenExpiresAt = null; consumedAt = null;
    }
}
