package com.f106.DIO.auth.signup;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;

final class SignupSecrets {
    private static final SecureRandom RANDOM = new SecureRandom();
    static String code() { return String.format(java.util.Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000)); }
    static String token() {
        byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    static String codeHash(String secret, String email, String code) {
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new SignupException(HttpStatus.SERVICE_UNAVAILABLE, "VERIFICATION_NOT_CONFIGURED", "이메일 인증 설정이 준비되지 않았어요.");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((email + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException error) { throw new IllegalStateException("HMAC unavailable", error); }
    }
    static String tokenHash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (GeneralSecurityException error) { throw new IllegalStateException("SHA-256 unavailable", error); }
    }
    static boolean matches(String a, String b) {
        return a != null && b != null && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
