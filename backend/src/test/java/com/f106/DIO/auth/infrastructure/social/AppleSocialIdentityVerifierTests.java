package com.f106.DIO.auth.infrastructure.social;

import com.f106.DIO.auth.config.AppleSocialProperties;
import com.f106.DIO.auth.domain.SocialProvider;
import com.f106.DIO.auth.exception.SocialLoginException;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import java.security.*;
import java.security.interfaces.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import static org.assertj.core.api.Assertions.*;

class AppleSocialIdentityVerifierTests {
    static final KeyPair KEY=key();
    static KeyPair key(){try{var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);return generator.generateKeyPair();}catch(Exception e){throw new IllegalStateException(e);}}
    AppleSocialIdentityVerifier verifier(){return new AppleSocialIdentityVerifier(NimbusJwtDecoder.withPublicKey((RSAPublicKey)KEY.getPublic()).build(),Set.of("com.f106.DIO"));}
    String token(Map<String,Object> changes,KeyPair signingKey){
        var claims=new HashMap<String,Object>();claims.put("iss","https://appleid.apple.com");claims.put("aud",List.of("com.f106.DIO"));
        claims.put("sub","001234.apple-subject.0123");claims.put("iat",Instant.now().minusSeconds(600));claims.put("exp",Instant.now().plusSeconds(600));
        claims.put("email","abc123@privaterelay.appleid.com");claims.put("email_verified","true");claims.put("is_private_email","true");claims.putAll(changes);
        var rsa=new com.nimbusds.jose.jwk.RSAKey.Builder((RSAPublicKey)signingKey.getPublic()).privateKey((RSAPrivateKey)signingKey.getPrivate()).keyID("test").build();
        var encoder=new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(rsa)));
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).keyId("test").build(),JwtClaimsSet.builder().claims(m->m.putAll(claims)).build())).getTokenValue();
    }
    @Test void validAppleTokenUsesSubjectAndRelayEmail(){
        var identity=verifier().verify(token(Map.of(),KEY));
        assertThat(identity.provider()).isEqualTo(SocialProvider.APPLE);
        assertThat(identity.subject()).isEqualTo("001234.apple-subject.0123");
        assertThat(identity.email()).isEqualTo("abc123@privaterelay.appleid.com");
        assertThat(identity.emailVerified()).isTrue();
        assertThat(verifier().verify(token(Map.of("email_verified",true),KEY)).emailVerified()).isTrue();
    }
    @Test void wrongIssuerAudienceExpiryAndSubjectAreRejected(){
        for(var change:List.of(Map.<String,Object>of("iss","https://accounts.google.com"),Map.<String,Object>of("aud",List.of("other.bundle")),
            Map.<String,Object>of("aud",List.of("com.f106.DIO","other.bundle")),Map.<String,Object>of("exp",Instant.now().minusSeconds(120)),
            Map.<String,Object>of("sub"," ")))
            assertThatThrownBy(()->verifier().verify(token(change,KEY))).isInstanceOfSatisfying(SocialLoginException.class,e->assertThat(e.code).isEqualTo("INVALID_SOCIAL_CREDENTIAL"));
    }
    @Test void tamperedAndWrongKeyTokensCannotAuthenticate(){
        for(String token:List.of("not-a-jwt",token(Map.of(),key())))
            assertThatThrownBy(()->verifier().verify(token)).isInstanceOf(SocialLoginException.class);
    }
    @Test void missingOrUnverifiedEmailIsNotTrusted(){
        assertThat(verifier().verify(token(Map.of("email_verified","false"),KEY)).emailVerified()).isFalse();
        var withoutEmail=verifier().verify(tokenWithout("email"));
        assertThat(withoutEmail.email()).isNull();assertThat(withoutEmail.emailVerified()).isFalse();
    }
    private String tokenWithout(String claim){
        var claims=new HashMap<String,Object>();claims.put("iss","https://appleid.apple.com");claims.put("aud",List.of("com.f106.DIO"));
        claims.put("sub","apple-subject");claims.put("iat",Instant.now().minusSeconds(600));claims.put("exp",Instant.now().plusSeconds(600));
        claims.put("email","x@privaterelay.appleid.com");claims.put("email_verified","true");claims.remove(claim);
        var rsa=new com.nimbusds.jose.jwk.RSAKey.Builder((RSAPublicKey)KEY.getPublic()).privateKey((RSAPrivateKey)KEY.getPrivate()).keyID("test").build();
        var encoder=new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(rsa)));
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).keyId("test").build(),JwtClaimsSet.builder().claims(m->m.putAll(claims)).build())).getTokenValue();
    }
    @Test void missingConfigurationDoesNotAttemptAuthentication(){
        var disabled=new AppleSocialIdentityVerifier(value->{throw new AssertionError("must not decode");},Set.of());
        assertThatThrownBy(()->disabled.verify("token")).isInstanceOfSatisfying(SocialLoginException.class,e->assertThat(e.code).isEqualTo("SOCIAL_PROVIDER_NOT_CONFIGURED"));
        assertThat(new AppleSocialProperties(" com.f106.DIO, ,com.f106.DIO ").clientIds()).containsExactly("com.f106.DIO");
    }
}
