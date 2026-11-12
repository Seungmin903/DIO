package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.config.LoginSecurityConfig;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;

class DevelopmentTokenHeaderTests {
    @Test void standardProfileIgnoresDevelopmentHeader() {
        var request = new MockHttpServletRequest();
        request.addHeader("X-DIO-Access-Token", "development-token");
        var resolver = new LoginSecurityConfig().loginBearerTokenResolver("");
        assertNull(resolver.resolve(request));
        request.addHeader("Authorization", "Bearer standard-token");
        assertEquals("standard-token", resolver.resolve(request));
    }
    @Test void developmentProfileSeparatesBasicAndBearerCredentials() {
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Basic ZGV2OmRldg==");
        request.addHeader("X-DIO-Access-Token", "development-token");
        assertEquals("development-token", new LoginSecurityConfig()
            .loginBearerTokenResolver("X-DIO-Access-Token").resolve(request));
    }
    @Test void arbitraryHeaderConfigurationIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> new LoginSecurityConfig().loginBearerTokenResolver("Cookie"));
    }
}
