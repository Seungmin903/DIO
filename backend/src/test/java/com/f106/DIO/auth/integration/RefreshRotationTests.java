package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.config.LoginProperties;
import com.f106.DIO.auth.support.RefreshRotation;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RefreshRotationTests {
    private RefreshRotation rotation() {
        byte[] key=new byte[32]; new java.security.SecureRandom().nextBytes(key);
        return new RefreshRotation(new LoginProperties(Base64.getEncoder().encodeToString(key),900,2592000));
    }
    @Test void graceIncludesStartButExcludesThirtySecondBoundary() {
        var rotation=rotation(); var start=Instant.parse("2026-11-05T00:00:00Z");
        assertThat(rotation.withinGrace(start,start)).isTrue();
        assertThat(rotation.withinGrace(start,start.plusSeconds(30).minusNanos(1))).isTrue();
        assertThat(rotation.withinGrace(start,start.plusSeconds(30))).isFalse();
        assertThat(rotation.withinGrace(start,start.minusNanos(1))).isFalse();
        assertThat(rotation.withinGrace(null,start)).isFalse();
    }
    @Test void successorIsStableButBoundToServerKeySessionAndPreviousToken() {
        var rotation=rotation(); var session=UUID.randomUUID();
        String previous=com.f106.DIO.auth.support.LoginSecrets.refresh();
        String next=rotation.successor(previous,session);
        assertThat(next).hasSize(43).matches("[A-Za-z0-9_-]{43}");
        assertThat(rotation.successor(previous,session)).isEqualTo(next);
        assertThat(rotation.successor(previous,UUID.randomUUID())).isNotEqualTo(next);
        assertThat(rotation.successor(next,session)).isNotEqualTo(next);
        assertThat(rotation().successor(previous,session)).isNotEqualTo(next);
    }
}
