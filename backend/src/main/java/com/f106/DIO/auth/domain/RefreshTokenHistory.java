package com.f106.DIO.auth.domain;

import java.time.Instant;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@lombok.Getter
@Entity @Table(name = "refresh_token_history")
public class RefreshTokenHistory {
    @Id @JdbcTypeCode(SqlTypes.CHAR) @Column(columnDefinition = "char(64)") private String tokenHash;
    @Column(nullable = false) private Long tokenId;
    @Column(nullable = false) private Instant rotatedAt;
    protected RefreshTokenHistory() {}
    public RefreshTokenHistory(RefreshToken token, Instant now) { tokenHash = token.getTokenHash(); tokenId = token.getTokenId(); rotatedAt = now; }
}
