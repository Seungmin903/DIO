package com.f106.DIO.push.security;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** 설치 자격증명과 토큰 원문은 로그나 평문 DB 컬럼에 저장하지 않는다. */
public final class PushSecrets {
    private final byte[] key;
    private final SecureRandom random;
    public PushSecrets(String base64Key) {
        try { key = Base64.getDecoder().decode(base64Key); }
        catch (RuntimeException e) { throw new IllegalArgumentException("Invalid push encryption key", e); }
        if (key.length != 32) throw new IllegalArgumentException("Push encryption key must be 256 bits");
        random = new SecureRandom();
    }
    public String newCredential() {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    public byte[] hash(String value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    public boolean matches(String value, byte[] expected) { return MessageDigest.isEqual(hash(value), expected); }
    public byte[] encrypt(byte[] plain, byte[] associatedData) {
        try {
            byte[] nonce = new byte[12]; random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(associatedData);
            byte[] encrypted = cipher.doFinal(plain), result = Arrays.copyOf(nonce, nonce.length + encrypted.length);
            System.arraycopy(encrypted, 0, result, nonce.length, encrypted.length);
            return result;
        } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException("Push encryption failed", e); }
    }
    public byte[] decrypt(byte[] encrypted, byte[] associatedData) {
        if (encrypted == null || encrypted.length < 28) throw new IllegalArgumentException("Invalid push ciphertext");
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, encrypted, 0, 12));
            cipher.updateAAD(associatedData);
            return cipher.doFinal(encrypted, 12, encrypted.length - 12);
        } catch (java.security.GeneralSecurityException e) { throw new IllegalArgumentException("Invalid push ciphertext", e); }
    }
}
