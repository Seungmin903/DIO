package com.f106.DIO.auth.infrastructure.social;

import com.f106.DIO.auth.config.AppleSocialProperties;
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

/**
 * Sign in with Apple identity token 검증. Apple의 고정 JWKS 주소만 쓰고, 토큰 안의 키 주소는 쓰지 않는다.
 * Apple이 넘겨주는 이메일(가리기 선택 시 privaterelay 주소 포함)은 Apple이 확인한 주소다.
 */
@Component
public class AppleSocialIdentityVerifier implements SocialIdentityVerifier {
    static final String ISSUER="https://appleid.apple.com";
    private final JwtDecoder decoder;
    private final Set<String> clientIds;
    @Autowired public AppleSocialIdentityVerifier(AppleSocialProperties properties) {
        this(decoder(),Set.copyOf(properties.clientIds()));
    }
    AppleSocialIdentityVerifier(JwtDecoder decoder,Set<String> clientIds) {this.decoder=decoder;this.clientIds=Set.copyOf(clientIds);}
    private static JwtDecoder decoder(){
        var factory=new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);factory.setReadTimeout(5000);
        return NimbusJwtDecoder.withJwkSetUri("https://appleid.apple.com/auth/keys")
            .restOperations(new RestTemplate(factory)).build();
    }
    @Override public SocialProvider provider(){return SocialProvider.APPLE;}
    @Override public VerifiedSocialIdentity verify(String credential){
        if(clientIds.isEmpty())throw new SocialLoginException(HttpStatus.SERVICE_UNAVAILABLE,
            "SOCIAL_PROVIDER_NOT_CONFIGURED","애플 로그인 설정을 준비하고 있어요.");
        if(credential==null||credential.isBlank()||credential.length()>16384)throw invalid();
        final Jwt token;
        try {token=decoder.decode(credential);}
        catch(BadJwtException | IllegalArgumentException invalidToken){throw invalid();}
        catch(JwtException unavailable){throw new SocialLoginException(HttpStatus.SERVICE_UNAVAILABLE,
            "SOCIAL_VERIFICATION_UNAVAILABLE","애플 인증을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");}
        try {return identity(token);} catch(IllegalArgumentException | ClassCastException malformedClaim){throw invalid();}
    }
    private VerifiedSocialIdentity identity(Jwt token){
        var audience=token.getAudience();
        String subject=token.getSubject();
        if(!ISSUER.equals(token.getClaimAsString("iss"))
            ||audience==null||audience.size()!=1||!clientIds.contains(audience.get(0))
            ||token.getExpiresAt()==null||!Instant.now().isBefore(token.getExpiresAt())
            ||subject==null||subject.isBlank()||subject.length()>255)throw invalid();
        String email=token.getClaimAsString("email");
        // Apple은 email_verified를 문자열 "true" 또는 불리언으로 보낸다.
        boolean verified=email!=null&&"true".equalsIgnoreCase(String.valueOf(token.getClaims().get("email_verified")));
        return new VerifiedSocialIdentity(provider(),subject,email,verified);
    }
    private static SocialLoginException invalid(){return new SocialLoginException(HttpStatus.UNAUTHORIZED,
        "INVALID_SOCIAL_CREDENTIAL","애플 로그인을 다시 진행해 주세요.");}
}
