package com.f106.DIO.auth.support;

import com.f106.DIO.auth.config.LoginProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/** Reconstructs only the immediate successor from a supplied token; stores no plaintext token. */
@Component
public class RefreshRotation {
    private final LoginProperties properties;
    public RefreshRotation(LoginProperties properties) { this.properties = properties; }
    public boolean withinGrace(java.time.Instant rotatedAt, java.time.Instant now) {
        return rotatedAt != null && !now.isBefore(rotatedAt) && now.isBefore(rotatedAt.plusSeconds(30));
    }
    public String successor(String previous, UUID sessionId) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(Base64.getDecoder().decode(properties.secret()), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(
                ("dio:refresh-rotation:v1:" + sessionId + ":" + previous).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            throw new IllegalStateException("Refresh rotation unavailable", error);
        }
    }
}
