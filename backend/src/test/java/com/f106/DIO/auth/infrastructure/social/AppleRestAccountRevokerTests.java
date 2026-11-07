package com.f106.DIO.auth.infrastructure.social;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import com.f106.DIO.auth.config.AppleRevokeProperties;
import com.f106.DIO.auth.config.AppleSocialProperties;
import com.f106.DIO.auth.domain.SocialProvider;
import com.f106.DIO.auth.domain.VerifiedSocialIdentity;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.exception.SocialLoginException;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class AppleRestAccountRevokerTests {
    static final Instant NOW = Instant.parse("2026-11-07T00:00:00Z");
    static final String TOKEN_URL = "https://appleid.apple.com/auth/token";
    static final String REVOKE_URL = "https://appleid.apple.com/auth/revoke";
    KeyPair keys;
    MockRestServiceServer apple;
    RestClient.Builder http;

    /** id_token 대신 "id:<subject>" 문자열을 받아 subject를 돌려주는 검증기. */
    final SocialIdentityVerifier verifier = new SocialIdentityVerifier() {
        public SocialProvider provider() { return SocialProvider.APPLE; }
        public VerifiedSocialIdentity verify(String token) {
            if (token == null || !token.startsWith("id:"))
                throw new SocialLoginException(HttpStatus.UNAUTHORIZED, "INVALID_SOCIAL_CREDENTIAL", "invalid");
            return new VerifiedSocialIdentity(SocialProvider.APPLE, token.substring(3), null, false);
        }
    };

    @BeforeEach
    void setUp() throws Exception {
        var generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        keys = generator.generateKeyPair();
        http = RestClient.builder();
        apple = MockRestServiceServer.bindTo(http).build();
    }

    AppleRestAccountRevoker revoker(AppleRevokeProperties properties) {
        return new AppleRestAccountRevoker(properties, verifier, http, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    AppleRevokeProperties configured() {
        return new AppleRevokeProperties("TEAM123456", "KEY1234567", "com.f106.DIO", (ECPrivateKey) keys.getPrivate());
    }

    static String tokenJson(String subject) {
        return "{\"access_token\":\"access\",\"refresh_token\":\"refresh\",\"id_token\":\"id:" + subject + "\"}";
    }

    static void code(Runnable call, HttpStatus status, String expected) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(LoginException.class, e -> {
            assertThat(e.status).isEqualTo(status);
            assertThat(e.code).isEqualTo(expected);
        });
    }

    @Test
    void exchangesCodeWithSignedClientSecretThenRevokesRefreshToken() {
        apple.expect(requestTo(TOKEN_URL)).andExpect(method(HttpMethod.POST))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
            .andExpect(content().formDataContains(Map.of("client_id", "com.f106.DIO",
                "code", "auth-code", "grant_type", "authorization_code")))
            .andExpect(request -> {
                String body = ((MockClientHttpRequest) request).getBodyAsString();
                String secret = URLDecoder.decode(body.replaceAll(".*client_secret=([^&]+).*", "$1"), StandardCharsets.UTF_8);
                try {
                    var jwt = SignedJWT.parse(secret);
                    assertThat(jwt.verify(new ECDSAVerifier((ECPublicKey) keys.getPublic()))).isTrue();
                    assertThat(jwt.getHeader().getAlgorithm().getName()).isEqualTo("ES256");
                    assertThat(jwt.getHeader().getKeyID()).isEqualTo("KEY1234567");
                    var claims = jwt.getJWTClaimsSet();
                    assertThat(claims.getIssuer()).isEqualTo("TEAM123456");
                    assertThat(claims.getSubject()).isEqualTo("com.f106.DIO");
                    assertThat(claims.getAudience()).containsExactly("https://appleid.apple.com");
                    assertThat(claims.getIssueTime().toInstant()).isEqualTo(NOW);
                    assertThat(claims.getExpirationTime().toInstant()).isEqualTo(NOW.plusSeconds(300));
                } catch (Exception error) {
                    throw new AssertionError(error);
                }
            })
            .andRespond(withSuccess(tokenJson("apple-user"), MediaType.APPLICATION_JSON));
        apple.expect(requestTo(REVOKE_URL)).andExpect(method(HttpMethod.POST))
            .andExpect(content().formDataContains(Map.of("client_id", "com.f106.DIO",
                "token", "refresh", "token_type_hint", "refresh_token")))
            .andRespond(withSuccess());

        revoker(configured()).revoke("apple-user", "auth-code");
        apple.verify();
    }

    @Test
    void differentAppleIdIsRejectedWithoutRevoking() {
        apple.expect(requestTo(TOKEN_URL)).andRespond(withSuccess(tokenJson("someone-else"), MediaType.APPLICATION_JSON));
        code(() -> revoker(configured()).revoke("apple-user", "auth-code"), HttpStatus.FORBIDDEN, "APPLE_ACCOUNT_MISMATCH");
        apple.verify();
    }

    @Test
    void expiredOrReusedCodeAsksToRetry() {
        apple.expect(requestTo(TOKEN_URL))
            .andRespond(withBadRequest().body("{\"error\":\"invalid_grant\"}").contentType(MediaType.APPLICATION_JSON));
        code(() -> revoker(configured()).revoke("apple-user", "auth-code"), HttpStatus.BAD_REQUEST, "INVALID_APPLE_AUTHORIZATION");
    }

    @Test
    void rejectedServerKeyIsServiceProblem() {
        apple.expect(requestTo(TOKEN_URL))
            .andRespond(withBadRequest().body("{\"error\":\"invalid_client\"}").contentType(MediaType.APPLICATION_JSON));
        code(() -> revoker(configured()).revoke("apple-user", "auth-code"), HttpStatus.SERVICE_UNAVAILABLE, "APPLE_REVOKE_UNAVAILABLE");
    }

    @Test
    void invalidIdTokenFromAppleIsRejected() {
        apple.expect(requestTo(TOKEN_URL))
            .andRespond(withSuccess("{\"refresh_token\":\"refresh\",\"id_token\":\"broken\"}", MediaType.APPLICATION_JSON));
        code(() -> revoker(configured()).revoke("apple-user", "auth-code"), HttpStatus.BAD_REQUEST, "INVALID_APPLE_AUTHORIZATION");
    }

    @Test
    void revokeFailureStopsWithdrawal() {
        apple.expect(requestTo(TOKEN_URL)).andRespond(withSuccess(tokenJson("apple-user"), MediaType.APPLICATION_JSON));
        apple.expect(requestTo(REVOKE_URL)).andRespond(withServerError());
        code(() -> revoker(configured()).revoke("apple-user", "auth-code"), HttpStatus.SERVICE_UNAVAILABLE, "APPLE_REVOKE_UNAVAILABLE");
    }

    @Test
    void accessTokenIsRevokedWhenNoRefreshToken() {
        apple.expect(requestTo(TOKEN_URL))
            .andRespond(withSuccess("{\"access_token\":\"access\",\"id_token\":\"id:apple-user\"}", MediaType.APPLICATION_JSON));
        apple.expect(requestTo(REVOKE_URL))
            .andExpect(content().formDataContains(Map.of("token", "access", "token_type_hint", "access_token")))
            .andRespond(withSuccess());
        revoker(configured()).revoke("apple-user", "auth-code");
        apple.verify();
    }

    @Test
    void missingKeyOrCodeNeverCallsApple() {
        var unconfigured = new AppleRevokeProperties("TEAM123456", "", "com.f106.DIO", (ECPrivateKey) null);
        code(() -> revoker(unconfigured).revoke("apple-user", "auth-code"), HttpStatus.SERVICE_UNAVAILABLE, "APPLE_REVOKE_NOT_CONFIGURED");
        code(() -> revoker(configured()).revoke("apple-user", " "), HttpStatus.BAD_REQUEST, "INVALID_APPLE_AUTHORIZATION");
        apple.verify();
    }

    @Test
    void privateKeyAcceptsPemEscapedOrBodyOnlyAndHidesValue() {
        var bundle = new AppleSocialProperties(List.of("com.f106.DIO"));
        String body = Base64.getEncoder().encodeToString(keys.getPrivate().getEncoded());
        // 테스트마다 새로 만든 키다. 표식 문자열을 나눠 써서 비밀값 스캔(gitleaks)이 실제 키로 오인하지 않게 한다.
        String label = "PRIVATE" + " KEY";
        String pem = "-----BEGIN " + label + "-----\n" + body.substring(0, 40) + "\n" + body.substring(40)
            + "\n-----END " + label + "-----\n";
        for (String value : new String[] {pem, pem.replace("\n", "\\n"), body}) {
            var properties = new AppleRevokeProperties("TEAM123456", "KEY1234567", value, bundle);
            assertThat(properties.configured()).isTrue();
            assertThat(properties.clientId()).isEqualTo("com.f106.DIO");
            assertThat(properties.privateKey().getEncoded()).isEqualTo(keys.getPrivate().getEncoded());
            assertThat(properties.toString()).doesNotContain(body.substring(0, 20)).contains("REDACTED");
        }
        assertThat(new AppleRevokeProperties("TEAM123456", "KEY1234567", "not-a-key", bundle).configured()).isFalse();
        assertThat(new AppleRevokeProperties("TEAM123456", "KEY1234567", "", bundle).configured()).isFalse();
    }
}
