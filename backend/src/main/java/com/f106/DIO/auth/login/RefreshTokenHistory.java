package com.f106.DIO.auth.login;

import java.time.Instant;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name = "refresh_token_history")
class RefreshTokenHistory {
    @Id @JdbcTypeCode(SqlTypes.CHAR) @Column(columnDefinition = "char(64)") String tokenHash;
    @Column(nullable = false) Long tokenId;
    @Column(nullable = false) Instant rotatedAt;
    protected RefreshTokenHistory() {}
    RefreshTokenHistory(RefreshToken token, Instant now) { tokenHash = token.tokenHash; tokenId = token.tokenId; rotatedAt = now; }
}
