package com.f106.DIO.user.domain;

import java.time.Instant;
import java.util.Locale;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@lombok.Getter
@Entity @Table(name = "users")
public class User {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long userId;
    @Column(unique = true, length = 255) private String email;
    @Column(nullable = false, length = 30) private String nickname;
    @Column(nullable = false, length = 30) private String nicknameKey;
    @Column(nullable = false, columnDefinition = "char(7)") @JdbcTypeCode(SqlTypes.CHAR) private String profileColor;
    @Column(nullable = false, length = 20) private String status;
    private Instant lastLoginAt;
    @Column(nullable = false) private Instant createdAt;
    @Column(nullable = false) private Instant updatedAt;
    private Instant deletedAt;
    protected User() {}
    public Long getUserId() { return userId; }
    public String getEmail() { return email; }
    public String getNickname() { return nickname; }
    public boolean isActive() { return deletedAt == null && "ACTIVE".equals(status); }
    public void withdraw(Instant now) {
        email=null;nickname="탈퇴한 사용자";nicknameKey="#withdrawn:"+userId;
        profileColor="#6F9FC6";lastLoginAt=null;status="WITHDRAWN";deletedAt=updatedAt=now;
    }
    public void recordLogin(Instant now) { lastLoginAt = now; }
    public void changeNickname(String nickname, Instant now) {
        this.nickname = nickname; nicknameKey = nickname.toLowerCase(Locale.ROOT); updatedAt = now;
    }
    // 기존 내 회원정보 서비스와 신규 MyProfileService 모두 같은 도메인 변경을 쓴다.
    public void updateNickname(String value, Instant now) { changeNickname(value, now); }
    public User(String email, String nickname, Instant now) {
        this.email = email; this.nickname = nickname; nicknameKey = nickname.toLowerCase(Locale.ROOT);
        // 기존 DB/공동 편집 색상 호환용. 회원가입 API에서는 입력·반환하지 않는다.
        profileColor = "#6F9FC6";
        status = "ACTIVE"; createdAt = updatedAt = now;
    }
}
