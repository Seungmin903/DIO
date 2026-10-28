package com.f106.DIO.diary.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DiaryRequestIdentityTests {
    private final JwtDecoder decoder = mock(JwtDecoder.class);
    private final DiaryRequestIdentity identity = new DiaryRequestIdentity(decoder, new DefaultBearerTokenResolver());

    @AfterEach void cleanup() {
        RequestContextHolder.resetRequestAttributes();
        SecurityContextHolder.clearContext();
    }
    MockHttpServletRequest request(String token) {
        var request = new MockHttpServletRequest();
        if (token != null) request.addHeader("Authorization", "Bearer " + token);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        return request;
    }
    long user() { return identity.requireUserId(() -> new IllegalArgumentException("unauthorized")); }
    Jwt decoded(String subject) {
        var builder = Jwt.withTokenValue("encoded").header("alg", "HS256").claim("token_use", "access");
        if (subject != null) builder.subject(subject);
        return builder.build();
    }

    @Test void requiresAnHttpRequestAndDoesNotTrustSecurityContextOrClientIds() {
        assertThatThrownBy(this::user).hasMessage("unauthorized");
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken("12", "ignored", java.util.List.of()));
        var request = request(null);
        request.addHeader("X-User-Id", "12");
        request.addHeader("X-DIO-Access-Token", "unverified");
        request.addParameter("userId", "12");
        request.addParameter("access_token", "unverified");
        assertThatThrownBy(this::user).hasMessage("unauthorized");
        verifyNoInteractions(decoder);
    }

    @Test void validatesEveryCallInsteadOfCachingTheUserAcrossRequests() {
        request("first");
        when(decoder.decode("first")).thenReturn(decoded("12")).thenThrow(new BadJwtException("revoked"));
        assertThat(user()).isEqualTo(12);
        assertThatThrownBy(this::user).hasMessage("unauthorized");
        request("second");
        when(decoder.decode("second")).thenReturn(decoded("23"));
        assertThat(user()).isEqualTo(23);
    }

    @Test void reusesOnlyAuthenticatedJwtMatchingTheCurrentBearer() {
        request("encoded");
        SecurityContextHolder.getContext().setAuthentication(
            new JwtAuthenticationToken(decoded("12"), java.util.List.of()));
        assertThat(user()).isEqualTo(12);
        assertThat(user()).isEqualTo(12);
        verifyNoInteractions(decoder);
        request("second");
        when(decoder.decode("second")).thenReturn(decoded("23"));
        assertThat(user()).isEqualTo(23);
        verify(decoder).decode("second");
    }

    @Test void unauthenticatedJwtAndGenericPrincipalsCannotBypassValidation() {
        request("encoded");
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(decoded("12")));
        when(decoder.decode("encoded")).thenThrow(new BadJwtException("revoked"));
        assertThatThrownBy(this::user).hasMessage("unauthorized");
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken("12", "ignored", java.util.List.of()));
        assertThatThrownBy(this::user).hasMessage("unauthorized");
        verify(decoder,times(2)).decode("encoded");
    }

    @Test void rejectsMissingMalformedNonPositiveAndOverflowingSubjects() {
        request("token");
        for (String subject : new String[] { null, "", "0", "-1", "+1", "1.0", "abc", "9223372036854775808" }) {
            when(decoder.decode("token")).thenReturn(decoded(subject));
            assertThatThrownBy(this::user).hasMessage("unauthorized");
        }
    }

    @Test void malformedBearerFailsClosedAndInfrastructureFailuresAreNotMisreportedAsUnauthorized() {
        var request = request(null);
        request.addHeader("Authorization", "Bearer a b");
        assertThatThrownBy(this::user).hasMessage("unauthorized");
        verifyNoInteractions(decoder);
        request("token");
        when(decoder.decode("token")).thenThrow(new IllegalStateException("database unavailable"));
        assertThatThrownBy(this::user).isInstanceOf(IllegalStateException.class).hasMessage("database unavailable");
    }
}
