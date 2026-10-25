package com.f106.DIO.auth.signup;

import java.time.Instant;
import java.util.Locale;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name = "users")
public class SignupUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long userId;
    @Column(unique = true, length = 255) String email;
    @Column(nullable = false, length = 30) String nickname;
    @Column(nullable = false, unique = true, length = 30) String nicknameKey;
    @Column(nullable = false, columnDefinition = "char(7)") @JdbcTypeCode(SqlTypes.CHAR) String profileColor;
    @Column(nullable = false, length = 20) String status;
    Instant lastLoginAt;
    @Column(nullable = false) Instant createdAt;
    @Column(nullable = false) Instant updatedAt;
    Instant deletedAt;
    protected SignupUser() {}
    public Long getUserId() { return userId; }
    public String getEmail() { return email; }
    public String getNickname() { return nickname; }
    public boolean isActive() { return deletedAt == null && "ACTIVE".equals(status); }
    public void recordLogin(Instant now) { lastLoginAt = now; }
    SignupUser(SignupDtos.SignupRequest request, Instant now) {
        email = request.email(); nickname = request.nickname(); nicknameKey = nickname.toLowerCase(Locale.ROOT);
        // 기존 DB/공동 편집 색상 호환용. 회원가입 API에서는 입력·반환하지 않는다.
        profileColor = "#6F9FC6";
        status = "ACTIVE"; createdAt = updatedAt = now;
    }
    SignupDtos.SignupResponse response(String profilePhotoUrl) {
        return new SignupDtos.SignupResponse(userId.toString(), email, nickname, profilePhotoUrl, createdAt);
    }
}
