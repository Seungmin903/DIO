package com.f106.DIO.auth.infrastructure.social;

import com.f106.DIO.auth.config.GoogleSocialProperties;
import com.f106.DIO.auth.domain.*;
import com.f106.DIO.auth.exception.SocialLoginException;
import java.time.Instant;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/** Only Google's fixed JWKS endpoint is used. Never use a key URL from a client token. */
@Component
public class GoogleSocialIdentityVerifier implements SocialIdentityVerifier {
    private final JwtDecoder decoder;
    private final Set<String> clientIds;
    @Autowired public GoogleSocialIdentityVerifier(GoogleSocialProperties properties) {
        this(decoder(),Set.copyOf(properties.clientIds()));
    }
    GoogleSocialIdentityVerifier(JwtDecoder decoder,Set<String> clientIds) {this.decoder=decoder;this.clientIds=Set.copyOf(clientIds);}
    private static JwtDecoder decoder(){
        var factory=new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);factory.setReadTimeout(5000);
        return NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
            .restOperations(new RestTemplate(factory)).build();
    }
    @Override public SocialProvider provider(){return SocialProvider.GOOGLE;}
    @Override public VerifiedSocialIdentity verify(String credential){
        if(clientIds.isEmpty())throw new SocialLoginException(HttpStatus.SERVICE_UNAVAILABLE,
            "SOCIAL_PROVIDER_NOT_CONFIGURED","구글 로그인 설정을 준비하고 있어요.");
        if(credential==null||credential.isBlank()||credential.length()>16384)throw invalid();
        final Jwt token;
        try {token=decoder.decode(credential);}
        catch(BadJwtException | IllegalArgumentException invalidToken){throw invalid();}
        catch(JwtException unavailable){throw new SocialLoginException(HttpStatus.SERVICE_UNAVAILABLE,
            "SOCIAL_VERIFICATION_UNAVAILABLE","구글 인증을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");}
        try {return identity(token);} catch(IllegalArgumentException | ClassCastException malformedClaim){throw invalid();}
    }
    private VerifiedSocialIdentity identity(Jwt token){
        String issuer=token.getClaimAsString("iss");
        var audience=token.getAudience();
        String azp=token.getClaimAsString("azp");
        String subject=token.getSubject();
        if(!Set.of("https://accounts.google.com","accounts.google.com").contains(issuer==null?"":issuer)
            ||audience==null||audience.stream().noneMatch(clientIds::contains)
            ||(audience.size()>1&&(azp==null||azp.isBlank()))
            ||(azp!=null&&!clientIds.contains(azp))
            ||token.getExpiresAt()==null||!Instant.now().isBefore(token.getExpiresAt())
            ||subject==null||subject.isBlank()||subject.length()>255)throw invalid();
        String email=token.getClaimAsString("email");
        // Non-Gmail/non-Workspace email ownership may have changed since Google first verified it.
        boolean authoritative=Boolean.TRUE.equals(token.getClaimAsBoolean("email_verified")) && email!=null
            && (email.toLowerCase(java.util.Locale.ROOT).endsWith("@gmail.com")
                ||token.getClaimAsString("hd")!=null&&!token.getClaimAsString("hd").isBlank());
        return new VerifiedSocialIdentity(provider(),subject,email,authoritative);
    }
    private static SocialLoginException invalid(){return new SocialLoginException(HttpStatus.UNAUTHORIZED,
        "INVALID_SOCIAL_CREDENTIAL","구글 로그인을 다시 진행해 주세요.");}
}
