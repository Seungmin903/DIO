package com.f106.DIO.auth.config;

import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 탈퇴 시 Apple 토큰 철회(/auth/revoke)에 쓰는 client_secret 서명 설정.
 * Team ID·Key ID·client ID는 공개 식별자이고, 개인 키(.p8)만 비밀값이다. 키 값은 로그·toString에 남기지 않는다.
 */
@Component
public final class AppleRevokeProperties {
    private final String teamId;
    private final String keyId;
    private final String clientId;
    private final ECPrivateKey privateKey;

    @Autowired
    public AppleRevokeProperties(@Value("${dio.auth.apple.team-id:}") String teamId,
            @Value("${dio.auth.apple.key-id:}") String keyId,
            @Value("${dio.auth.apple.private-key:}") String privateKey,
            AppleSocialProperties apple) {
        this(teamId, keyId, apple.clientIds().isEmpty() ? "" : apple.clientIds().get(0), parse(privateKey));
    }

    public AppleRevokeProperties(String teamId, String keyId, String clientId, ECPrivateKey privateKey) {
        this.teamId = teamId == null ? "" : teamId.trim();
        this.keyId = keyId == null ? "" : keyId.trim();
        this.clientId = clientId == null ? "" : clientId.trim();
        this.privateKey = privateKey;
    }

    public boolean configured() {
        return !teamId.isEmpty() && !keyId.isEmpty() && !clientId.isEmpty() && privateKey != null;
    }

    public String teamId() { return teamId; }
    public String keyId() { return keyId; }
    public String clientId() { return clientId; }
    public ECPrivateKey privateKey() { return privateKey; }

    /** .p8 전체(PEM), 줄바꿈을 \n으로 쓴 한 줄, BEGIN/END를 뺀 본문 한 줄을 모두 받는다. */
    static ECPrivateKey parse(String value) {
        if (value == null || value.isBlank()) return null;
        String body = value.replace("\\n", "\n")
            .replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replaceAll("\\s", "");
        try {
            var spec = new PKCS8EncodedKeySpec(Base64.getDecoder().decode(body));
            return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(spec);
        } catch (Exception invalid) {
            LoggerFactory.getLogger(AppleRevokeProperties.class)
                .warn("AUTH_APPLE_PRIVATE_KEY 형식을 읽지 못했습니다. Apple .p8 키 전체 또는 본문을 넣어 주세요.");
            return null;
        }
    }

    @Override
    public String toString() {
        return "AppleRevokeProperties[teamId=" + teamId + ", keyId=" + keyId + ", clientId=" + clientId
            + ", privateKey=" + (privateKey == null ? "missing" : "REDACTED") + "]";
    }
}
