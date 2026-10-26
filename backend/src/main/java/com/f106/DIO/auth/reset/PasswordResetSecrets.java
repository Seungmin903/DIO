package com.f106.DIO.auth.reset;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;

final class PasswordResetSecrets {
    private static final SecureRandom RANDOM = new SecureRandom();
    static void configured(String secret) {
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32)
            throw new PasswordResetException(HttpStatus.SERVICE_UNAVAILABLE, "VERIFICATION_NOT_CONFIGURED", "이메일 인증 설정이 준비되지 않았어요.");
    }
    static String code() { return String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000)); }
    static String token() {
        byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    static String codeHash(String secret, String email, String code) {
        configured(secret);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(("password-reset:" + email + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException error) { throw new IllegalStateException("HMAC unavailable", error); }
    }
    static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (GeneralSecurityException error) { throw new IllegalStateException("SHA-256 unavailable", error); }
    }
    static boolean matches(String left, String right) {
        return left != null && right != null && MessageDigest.isEqual(left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
    }
}
