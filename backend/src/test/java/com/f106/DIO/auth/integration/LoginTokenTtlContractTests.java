package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.config.LoginProperties;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.security.LoginJwt;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class LoginTokenTtlContractTests {
    private LoginJwt jwt(long seconds) {
        return new LoginJwt(new LoginProperties(Base64.getEncoder().encodeToString(new byte[32]), seconds, 2592000));
    }

    @Test void frontendAcceptedTtlBoundariesMatchServerConfiguration() {
        for (long seconds : new long[] {60, 900, 86400}) {
            assertThatCode(() -> jwt(seconds).configured()).doesNotThrowAnyException();
        }
    }

    @Test void serverRejectsTtlOutsideItsDocumentedRange() {
        for (long seconds : new long[] {0, 59, 86401}) {
            assertThatThrownBy(() -> jwt(seconds).configured())
                .isInstanceOfSatisfying(LoginException.class, error -> assertThat(error.code).isEqualTo("LOGIN_NOT_CONFIGURED"));
        }
    }
}
