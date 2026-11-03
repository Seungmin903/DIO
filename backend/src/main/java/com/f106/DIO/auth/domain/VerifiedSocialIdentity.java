package com.f106.DIO.auth.domain;
/** Created only by a server-side provider verifier, never bound from an HTTP request. */
public record VerifiedSocialIdentity(SocialProvider provider,String subject,String email,boolean emailVerified) {
    @Override public String toString(){return "VerifiedSocialIdentity[identity=REDACTED]";}
}
