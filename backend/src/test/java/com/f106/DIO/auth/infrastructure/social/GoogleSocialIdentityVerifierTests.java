package com.f106.DIO.auth.infrastructure.social;

import com.f106.DIO.auth.config.GoogleSocialProperties;
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

class GoogleSocialIdentityVerifierTests {
    static final KeyPair KEY=key();
    static KeyPair key(){try{var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);return generator.generateKeyPair();}catch(Exception e){throw new IllegalStateException(e);}}
    GoogleSocialIdentityVerifier verifier(){return new GoogleSocialIdentityVerifier(NimbusJwtDecoder.withPublicKey((RSAPublicKey)KEY.getPublic()).build(),Set.of("dio-client"));}
    String token(Map<String,Object> changes,KeyPair signingKey){
        var claims=new HashMap<String,Object>();claims.put("iss","https://accounts.google.com");claims.put("aud",List.of("dio-client"));
        claims.put("sub","google-subject");claims.put("iat",Instant.now().minusSeconds(600));claims.put("exp",Instant.now().plusSeconds(300));
        claims.put("email","member@gmail.com");claims.put("email_verified",true);claims.putAll(changes);
        var rsa=new com.nimbusds.jose.jwk.RSAKey.Builder((RSAPublicKey)signingKey.getPublic()).privateKey((RSAPrivateKey)signingKey.getPrivate()).keyID("test").build();
        var encoder=new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(rsa)));
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).keyId("test").build(),JwtClaimsSet.builder().claims(m->m.putAll(claims)).build())).getTokenValue();
    }
    @Test void validSignedGoogleTokenUsesSubjectAndEmail(){var identity=verifier().verify(token(Map.of(),KEY));assertThat(identity.subject()).isEqualTo("google-subject");assertThat(identity.emailVerified()).isTrue();}
    @Test void wrongIssuerAudienceExpirySubjectAndPresenterAreRejected(){
        for(var change:List.of(Map.<String,Object>of("iss","https://evil.test"),Map.<String,Object>of("aud",List.of("other-client")),
            Map.<String,Object>of("exp",Instant.now().minusSeconds(120)),Map.<String,Object>of("sub"," "),
            Map.<String,Object>of("azp","other-client"),Map.<String,Object>of("aud",List.of("dio-client","another"))))
            assertThatThrownBy(()->verifier().verify(token(change,KEY))).isInstanceOfSatisfying(SocialLoginException.class,e->assertThat(e.code).isEqualTo("INVALID_SOCIAL_CREDENTIAL"));
    }
    @Test void tamperedAndWrongKeyTokensCannotAuthenticate(){
        for(String token:List.of("not-a-jwt",token(Map.of(),key())))
            assertThatThrownBy(()->verifier().verify(token)).isInstanceOf(SocialLoginException.class);
    }
    @Test void emailVerificationIsNotAssumedForThirdPartyEmail(){
        assertThat(verifier().verify(token(Map.of("email","user@example.com"),KEY)).emailVerified()).isFalse();
        assertThat(verifier().verify(token(Map.of("email","user@workspace.test","hd","workspace.test"),KEY)).emailVerified()).isTrue();
        assertThat(verifier().verify(token(Map.of("email_verified",false),KEY)).emailVerified()).isFalse();
    }
    @Test void missingConfigurationDoesNotAttemptAuthentication(){
        var disabled=new GoogleSocialIdentityVerifier(value->{throw new AssertionError("must not decode");},Set.of());
        assertThatThrownBy(()->disabled.verify("token")).isInstanceOfSatisfying(SocialLoginException.class,e->assertThat(e.code).isEqualTo("SOCIAL_PROVIDER_NOT_CONFIGURED"));
        assertThat(GoogleSocialProperties.parse(" dio-client, ,dio-client,ios-client ")).containsExactly("dio-client","ios-client");
    }
}
