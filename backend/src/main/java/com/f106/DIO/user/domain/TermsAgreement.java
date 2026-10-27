package com.f106.DIO.user.domain;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import jakarta.persistence.*;

@lombok.Getter
@Entity @Table(name = "user_terms_agreements") @IdClass(TermsAgreement.Key.class)
public class TermsAgreement {
    @Id @Column(length = 20) private String termsType;
    @Id @Column(length = 20) private String termsVersion;
    @Id private Long userId;
    @Column(nullable = false) private boolean agreed;
    @Column(nullable = false) private Instant agreedAt;
    protected TermsAgreement() {}
    public TermsAgreement(Long userId, String termsType, String termsVersion, boolean agreed, Instant now) {
        this.userId = userId; this.termsType = termsType; this.termsVersion = termsVersion;
        this.agreed = agreed; agreedAt = now;
    }
    public static class Key implements Serializable {
        public String termsType;
        public String termsVersion;
        public Long userId;
        public Key() {}
        @Override public boolean equals(Object value) {
            return value instanceof Key key && Objects.equals(termsType, key.termsType)
                && Objects.equals(termsVersion, key.termsVersion) && Objects.equals(userId, key.userId);
        }
        @Override public int hashCode() { return Objects.hash(termsType, termsVersion, userId); }
    }
}
