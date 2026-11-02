package com.f106.DIO.auth.domain;

import java.time.Instant;
import jakarta.persistence.*;

@lombok.Getter
@Entity @Table(name = "user_auth_accounts", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"provider", "provider_subject"}),
    @UniqueConstraint(columnNames = {"user_id", "provider"})})
public class EmailAuthProvider {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "auth_account_id") private Long authId;
    @Column(nullable = false) private Long userId;
    @Column(nullable = false, length = 20) private String provider;
    @Column(name = "provider_subject", nullable = false, length = 255) private String providerUserId;
    @Column(length = 255) private String passwordHash;
    @Column(name = "linked_at", nullable = false) private Instant createdAt;
    protected EmailAuthProvider() {}
    public Long getUserId() { return userId; }
    public void resetPassword(String encodedPassword) { passwordHash = encodedPassword; }
    public String getPasswordHash() { return passwordHash; }
    public EmailAuthProvider(Long userId, String email, String passwordHash, Instant now) {
        this.userId = userId; provider = "EMAIL"; providerUserId = email;
        this.passwordHash = passwordHash; createdAt = now;
    }
    public static EmailAuthProvider social(Long userId, SocialProvider provider, String subject, Instant now) {
        var account=new EmailAuthProvider();account.userId=userId;account.provider=provider.name();
        account.providerUserId=subject;account.createdAt=now;account.passwordHash=null;
        return account;
    }
}
