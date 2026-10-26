package com.f106.DIO.auth.signup;

import java.time.Instant;
import jakarta.persistence.*;

@Entity @Table(name = "user_auth_accounts", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"provider", "provider_subject"}),
    @UniqueConstraint(columnNames = {"user_id", "provider"})})
public class EmailAuthProvider {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "auth_account_id") Long authId;
    @Column(nullable = false) Long userId;
    @Column(nullable = false, length = 20) String provider;
    @Column(name = "provider_subject", nullable = false, length = 255) String providerUserId;
    @Column(length = 255) String passwordHash;
    @Column(name = "linked_at", nullable = false) Instant createdAt;
    protected EmailAuthProvider() {}
    public Long getUserId() { return userId; }
    public String getPasswordHash() { return passwordHash; }
    public void resetPassword(String encodedPassword) { passwordHash = encodedPassword; }
    EmailAuthProvider(Long userId, String email, String passwordHash, Instant now) {
        this.userId = userId; provider = "EMAIL"; providerUserId = email;
        this.passwordHash = passwordHash; createdAt = now;
    }
}
