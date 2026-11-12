package com.f106.DIO.auth.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@lombok.Getter
@Entity @Table(name = "refresh_tokens")
public class RefreshToken {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long tokenId;
    @Column(nullable = false, unique = true) private UUID sessionId;
    @Column(nullable = false) private Long userId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(nullable = false, unique = true, columnDefinition = "char(64)") private String tokenHash;
    @Column(length = 100) private String deviceName;
    @Column(nullable = false) private Instant expiresAt;
    private Instant revokedAt;
    @Column(nullable = false) private Instant createdAt;
    protected RefreshToken() {}
    public RefreshToken(Long userId, String hash, String deviceName, Instant now, Instant expiry) {
        sessionId = UUID.randomUUID(); this.userId = userId; tokenHash = hash; this.deviceName = deviceName;
        createdAt = now; expiresAt = expiry;
    }
    public boolean active(Instant now) { return revokedAt == null && now.isBefore(expiresAt); }

    public void revoke(Instant now) { revokedAt = now; }
    public void rotate(String hash) { tokenHash = hash; }
    public void extendUntil(Instant expiry) { expiresAt = expiry; }
}
