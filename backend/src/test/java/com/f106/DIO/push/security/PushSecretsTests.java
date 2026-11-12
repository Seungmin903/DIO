package com.f106.DIO.push.security;

import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import static org.assertj.core.api.Assertions.*;

class PushSecretsTests {
    @Test void credentialsAreRandomAndStoredOnlyAsHash() {
        var secrets = new PushSecrets(Base64.getEncoder().encodeToString(new byte[32]));
        String first = secrets.newCredential(), second = secrets.newCredential();
        assertThat(Base64.getUrlDecoder().decode(first)).hasSize(32);
        assertThat(first).isNotEqualTo(second);
        assertThat(secrets.matches(first, secrets.hash(first))).isTrue();
        assertThat(secrets.matches(second, secrets.hash(first))).isFalse();
    }
    @Test void ciphertextAuthenticatesContextAndTampering() {
        var secrets = new PushSecrets(Base64.getEncoder().encodeToString(new byte[32]));
        byte[] data = "secret-token".getBytes(StandardCharsets.UTF_8), aad = "installation-1".getBytes(StandardCharsets.UTF_8);
        byte[] encrypted = secrets.encrypt(data, aad);
        assertThat(secrets.decrypt(encrypted, aad)).isEqualTo(data);
        assertThat(secrets.encrypt(data, aad)).isNotEqualTo(encrypted);
        assertThatThrownBy(() -> secrets.decrypt(encrypted, "installation-2".getBytes(StandardCharsets.UTF_8))).isInstanceOf(IllegalArgumentException.class);
        encrypted[encrypted.length-1] ^= 1;
        assertThatThrownBy(() -> secrets.decrypt(encrypted, aad)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PushSecrets("bad")).isInstanceOf(IllegalArgumentException.class);
    }
}
