package com.f106.DIO.auth.security;

import com.f106.DIO.auth.config.LoginProperties;
import com.f106.DIO.auth.exception.LoginException;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import javax.crypto.spec.SecretKeySpec;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.proc.SecurityContext;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;

@Component
public class LoginJwt {
    private final LoginProperties properties;
    private volatile Codec codec;
    private record Codec(JwtEncoder encoder, JwtDecoder decoder) {}
    public LoginJwt(LoginProperties properties) { this.properties = properties; }
    public void configured() { codec(); }
    public String issue(Long userId, UUID sessionId, Instant now, Instant expiresAt) {
        var claims = JwtClaimsSet.builder().issuer("dio").audience(List.of("dio-api"))
            .subject(userId.toString()).issuedAt(now).expiresAt(expiresAt).id(UUID.randomUUID().toString())
            .claim("sid", sessionId.toString()).claim("token_use", "access").build();
        return codec().encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(), claims)).getTokenValue();
    }
    public Jwt decode(String token) { return codec().decoder.decode(token); }
    private Codec codec() {
        if (codec != null) return codec;
        synchronized (this) {
            if (codec != null) return codec;
            byte[] bytes;
            try { bytes = Base64.getDecoder().decode(properties.secret()); }
            catch (IllegalArgumentException error) { throw notConfigured(); }
            if (bytes.length < 32 || properties.accessSeconds() < 60 || properties.accessSeconds() > 86400
                    || properties.refreshSeconds() <= properties.accessSeconds() || properties.refreshSeconds() > 90L * 86400) throw notConfigured();
            var key = new SecretKeySpec(bytes, "HmacSHA256");
            var encoder = new NimbusJwtEncoder(new ImmutableSecret<SecurityContext>(key));
            var decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtTimestampValidator(Duration.ZERO), new JwtIssuerValidator("dio"),
                new JwtClaimValidator<List<String>>("aud", audience -> audience != null && audience.contains("dio-api")),
                new JwtClaimValidator<String>("token_use", "access"::equals)));
            codec = new Codec(encoder, decoder);
            return codec;
        }
    }
    private LoginException notConfigured() {
        return new LoginException(HttpStatus.SERVICE_UNAVAILABLE, "LOGIN_NOT_CONFIGURED", "로그인 서버 설정을 확인해 주세요.");
    }
}
