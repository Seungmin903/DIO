package com.f106.DIO.auth.infrastructure.social;

import com.f106.DIO.auth.config.AppleRevokeProperties;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.exception.SocialLoginException;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.time.Clock;
import java.util.Date;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Apple REST API로 토큰을 교환(/auth/token)하고 철회(/auth/revoke)한다.
 * Apple 토큰은 DB에 저장하지 않고, 탈퇴 직전 앱이 다시 받은 authorizationCode로 한 번만 쓴다.
 */
@Component
public class AppleRestAccountRevoker implements AppleAccountRevoker {
    static final String APPLE = "https://appleid.apple.com";
    private static final Logger log = LoggerFactory.getLogger(AppleRestAccountRevoker.class);
    private static final ParameterizedTypeReference<Map<String, Object>> JSON = new ParameterizedTypeReference<>() {};

    private final AppleRevokeProperties properties;
    private final SocialIdentityVerifier identities;
    private final RestClient http;
    private final Clock clock;

    @Autowired
    public AppleRestAccountRevoker(AppleRevokeProperties properties, AppleSocialIdentityVerifier identities) {
        this(properties, identities, RestClient.builder().requestFactory(factory()), Clock.systemUTC());
    }

    AppleRestAccountRevoker(AppleRevokeProperties properties, SocialIdentityVerifier identities,
            RestClient.Builder http, Clock clock) {
        this.properties = properties;
        this.identities = identities;
        this.http = http.baseUrl(APPLE).build();
        this.clock = clock;
    }

    private static SimpleClientHttpRequestFactory factory() {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(5000);
        return factory;
    }

    @Override
    public void revoke(String subject, String authorizationCode) {
        if (!properties.configured()) throw new LoginException(HttpStatus.SERVICE_UNAVAILABLE,
            "APPLE_REVOKE_NOT_CONFIGURED", "애플 계정 연결 해제를 준비하고 있어요. 잠시 후 다시 시도해 주세요.");
        if (authorizationCode == null || authorizationCode.isBlank() || authorizationCode.length() > 4096)
            throw invalidCode();
        String secret = clientSecret();
        Map<String, Object> tokens = exchange(secret, authorizationCode.trim());
        String owner;
        try {
            owner = identities.verify(text(tokens.get("id_token"))).subject();
        } catch (SocialLoginException invalid) {
            throw invalidCode();
        }
        if (!owner.equals(subject)) throw new LoginException(HttpStatus.FORBIDDEN, "APPLE_ACCOUNT_MISMATCH",
            "탈퇴하려는 계정과 같은 애플 ID로 다시 확인해 주세요.");
        String refresh = text(tokens.get("refresh_token"));
        String token = refresh != null ? refresh : text(tokens.get("access_token"));
        if (token == null) throw unavailable();
        var form = form(secret);
        form.add("token", token);
        form.add("token_type_hint", refresh != null ? "refresh_token" : "access_token");
        try {
            http.post().uri("/auth/revoke").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form).retrieve().toBodilessEntity();
        } catch (RestClientException error) {
            log.warn("Apple token revoke failed: {}", error.getClass().getSimpleName());
            throw unavailable();
        }
    }

    private Map<String, Object> exchange(String secret, String code) {
        var form = form(secret);
        form.add("code", code);
        form.add("grant_type", "authorization_code");
        try {
            Map<String, Object> body = http.post().uri("/auth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form).retrieve().body(JSON);
            if (body == null) throw unavailable();
            return body;
        } catch (HttpClientErrorException.BadRequest rejected) {
            // invalid_grant: 만료(5분)·재사용·다른 앱의 code. invalid_client는 서버 키 설정 문제다.
            if (rejected.getResponseBodyAsString().contains("invalid_client")) {
                log.warn("Apple rejected client_secret. Check AUTH_APPLE_TEAM_ID / AUTH_APPLE_KEY_ID / AUTH_APPLE_PRIVATE_KEY.");
                throw unavailable();
            }
            throw invalidCode();
        } catch (RestClientException error) {
            log.warn("Apple token exchange failed: {}", error.getClass().getSimpleName());
            throw unavailable();
        }
    }

    private LinkedMultiValueMap<String, String> form(String secret) {
        var form = new LinkedMultiValueMap<String, String>();
        form.add("client_id", properties.clientId());
        form.add("client_secret", secret);
        return form;
    }

    /** Apple이 요구하는 client_secret: ES256 JWT, iss=Team ID, sub=client ID, aud=https://appleid.apple.com. */
    String clientSecret() {
        var now = clock.instant();
        var header = new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(properties.keyId()).build();
        var claims = new JWTClaimsSet.Builder().issuer(properties.teamId()).subject(properties.clientId())
            .audience(APPLE).issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(300))).build();
        try {
            var jwt = new SignedJWT(header, claims);
            jwt.sign(new ECDSASigner(properties.privateKey()));
            return jwt.serialize();
        } catch (JOSEException error) {
            log.warn("Apple client_secret signing failed");
            throw unavailable();
        }
    }

    private static String text(Object value) {
        return value instanceof String s && !s.isBlank() ? s : null;
    }

    private static LoginException invalidCode() {
        return new LoginException(HttpStatus.BAD_REQUEST, "INVALID_APPLE_AUTHORIZATION",
            "애플 확인이 만료됐어요. 탈퇴를 다시 진행해 주세요.");
    }

    private static LoginException unavailable() {
        return new LoginException(HttpStatus.SERVICE_UNAVAILABLE, "APPLE_REVOKE_UNAVAILABLE",
            "애플 계정 연결을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
}
