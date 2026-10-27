package com.f106.DIO.auth.signup;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import jakarta.persistence.*;

@Entity @Table(name = "user_terms_agreements") @IdClass(TermsAgreement.Key.class)
public class TermsAgreement {
    @Id @Column(length = 20) String termsType;
    @Id @Column(length = 20) String termsVersion;
    @Id Long userId;
    @Column(nullable = false) boolean agreed;
    @Column(nullable = false) Instant agreedAt;
    protected TermsAgreement() {}
    TermsAgreement(Long userId, SignupDtos.Agreement agreement, Instant now) {
        this.userId = userId; termsType = agreement.termsType().name();
        termsVersion = agreement.termsVersion(); agreed = agreement.agreed(); agreedAt = now;
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
