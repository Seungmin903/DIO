package com.f106.DIO.auth.login;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name = "refresh_tokens")
class RefreshToken {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long tokenId;
    @Column(nullable = false, unique = true) UUID sessionId;
    @Column(nullable = false) Long userId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(nullable = false, unique = true, columnDefinition = "char(64)") String tokenHash;
    @Column(length = 100) String deviceName;
    @Column(nullable = false) Instant expiresAt;
    Instant revokedAt;
    @Column(nullable = false) Instant createdAt;
    protected RefreshToken() {}
    RefreshToken(Long userId, String hash, String deviceName, Instant now, Instant expiry) {
        sessionId = UUID.randomUUID(); this.userId = userId; tokenHash = hash; this.deviceName = deviceName;
        createdAt = now; expiresAt = expiry;
    }
    boolean active(Instant now) { return revokedAt == null && now.isBefore(expiresAt); }
}
