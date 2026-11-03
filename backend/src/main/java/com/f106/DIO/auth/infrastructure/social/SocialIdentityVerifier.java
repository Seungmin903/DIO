package com.f106.DIO.auth.infrastructure.social;
import com.f106.DIO.auth.domain.SocialProvider;
import com.f106.DIO.auth.domain.VerifiedSocialIdentity;
/** Implementations must validate credentials with provider-specific issuer/audience/expiry/replay rules. */
public interface SocialIdentityVerifier {
    SocialProvider provider();
    VerifiedSocialIdentity verify(String credential);
}
