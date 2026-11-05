package com.f106.DIO.auth.support;

import com.f106.DIO.auth.config.LoginProperties;
import com.f106.DIO.auth.config.LoginSessionPolicy;
import com.f106.DIO.auth.exception.LoginException;
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
        return rotatedAt != null && !now.isBefore(rotatedAt) && now.isBefore(rotatedAt.plus(LoginSessionPolicy.ROTATION_GRACE));
    }
    public String successor(String previous, UUID sessionId) {
        try {
            if (properties.secret() == null) throw LoginException.notConfigured();
            byte[] key = Base64.getDecoder().decode(properties.secret());
            if (key.length < 32) throw LoginException.notConfigured();
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(
                ("dio:refresh-rotation:v1:" + sessionId + ":" + previous).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            throw LoginException.notConfigured();
        }
    }
}
