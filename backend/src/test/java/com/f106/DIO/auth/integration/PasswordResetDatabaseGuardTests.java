package com.f106.DIO.auth.integration;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PasswordResetDatabaseGuardTests {
    @Test void acceptsOnlyExplicitDedicatedDatabaseWithoutUrlOptions() {
        assertThat(PasswordResetPostgresTests.validatedUrl("jdbc:postgresql://127.0.0.1:55432/dio_reset_qa"))
            .endsWith("/dio_reset_qa");
        for (String url : new String[]{null, "jdbc:postgresql://127.0.0.1:5432/dio",
                "jdbc:postgresql://127.0.0.1:5432/auth_ci", "jdbc:postgresql://remote:5432/dio_reset_qa",
                "jdbc:postgresql://127.0.0.1:5432/dio_reset_qa?currentSchema=public"}) {
            assertThatThrownBy(() -> PasswordResetPostgresTests.validatedUrl(url)).isInstanceOf(IllegalStateException.class);
        }
    }
}
