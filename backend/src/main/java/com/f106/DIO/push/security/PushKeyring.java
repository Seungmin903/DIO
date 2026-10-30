package com.f106.DIO.push.security;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/** 키 ID를 인증된 데이터에 포함하는 버전 1 암호문. 키 본문은 출력하지 않는다. */
public final class PushKeyring {
    private final String activeId;
    private final Map<String, PushSecrets> keys;
    public record Encrypted(String keyId, byte[] ciphertext) {}

    public PushKeyring(String activeId, Map<String, String> encodedKeys) {
        if (activeId == null || !activeId.matches("[A-Za-z0-9_-]{1,64}") || encodedKeys == null || encodedKeys.isEmpty())
            throw new IllegalArgumentException("Invalid push key configuration");
        var parsed = new LinkedHashMap<String, PushSecrets>();
        encodedKeys.forEach((id, value) -> {
            if (id == null || !id.matches("[A-Za-z0-9_-]{1,64}")) throw new IllegalArgumentException("Invalid push key identifier");
            parsed.put(id, new PushSecrets(value));
        });
        if (!parsed.containsKey(activeId)) throw new IllegalArgumentException("Active push key unavailable");
        this.activeId = activeId; this.keys = Map.copyOf(parsed);
    }
    public String activeId() { return activeId; }
    public java.util.Set<String> keyIds() { return keys.keySet(); }
    public String newCredential() { return keys.get(activeId).newCredential(); }
    public byte[] hash(String value) { return keys.get(activeId).hash(value); }
    public boolean matches(String value, byte[] expected) { return keys.get(activeId).matches(value, expected); }
    public Encrypted encrypt(byte[] plaintext, byte[] context) {
        return new Encrypted(activeId, keys.get(activeId).encrypt(plaintext, authenticatedContext(activeId, context)));
    }
    public byte[] decrypt(String keyId, byte[] ciphertext, byte[] context) {
        PushSecrets key = keys.get(keyId);
        if (key == null) throw new IllegalArgumentException("Push encryption key unavailable");
        return key.decrypt(ciphertext, authenticatedContext(keyId, context));
    }
    public byte[] decryptLegacy(String keyId, byte[] ciphertext, byte[] context) {
        PushSecrets key = keys.get(keyId);
        if (key == null) throw new IllegalArgumentException("Push encryption key unavailable");
        return key.decrypt(ciphertext, context);
    }
    private byte[] authenticatedContext(String keyId, byte[] context) {
        byte[] prefix = ("dio-push-v1:" + keyId + ":").getBytes(StandardCharsets.UTF_8);
        byte[] result = java.util.Arrays.copyOf(prefix, prefix.length + context.length);
        System.arraycopy(context, 0, result, prefix.length, context.length);
        return result;
    }
}
