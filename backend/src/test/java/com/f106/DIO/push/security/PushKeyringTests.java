package com.f106.DIO.push.security;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PushKeyringTests {
    @Test void rotatedKeyCanReadOldCiphertextAndAuthenticateKeyId() {
        String a=Base64.getEncoder().encodeToString(new byte[32]);byte[] bBytes=new byte[32];bBytes[0]=1;String b=Base64.getEncoder().encodeToString(bBytes);
        byte[] context="installation:purpose".getBytes(StandardCharsets.UTF_8), plain="token".getBytes(StandardCharsets.UTF_8);
        var old=new PushKeyring("old",Map.of("old",a));var cipher=old.encrypt(plain,context);
        var rotated=new PushKeyring("new",Map.of("old",a,"new",b));
        assertThat(rotated.decrypt(cipher.keyId(),cipher.ciphertext(),context)).isEqualTo(plain);
        assertThat(rotated.encrypt(plain,context).keyId()).isEqualTo("new");
        assertThatThrownBy(()->rotated.decrypt("new",cipher.ciphertext(),context)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new PushKeyring("new",Map.of("old",a))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new PushKeyring("new",Map.of("new",b)).decrypt("old",cipher.ciphertext(),context)).isInstanceOf(IllegalArgumentException.class);
    }
}
