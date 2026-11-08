package com.f106.DIO.page.domain;

import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;

/**
 * 원격 속지(V34): 앱 배포 없이 에셋 저장소(catalog.json)에 올린 속지.
 * 서버는 방향마다 범용 행(dio-remote-landscape · dio-remote-portrait) 하나를 두고, 페이지 설정의 remoteTemplate(속지 id)으로 그림을 구분한다.
 * 공유 다이어리의 다른 구성원 앱도 이 값으로 속지를 찾으므로, 다이어리 생성 · 페이지 추가 · 수정이 모두 같은 규칙으로 검사한다.
 */
public final class RemoteTemplates {
    public static final String CODE_PREFIX = "dio-remote-";
    public static final String CONFIG_KEY = "remoteTemplate";
    private static final Pattern ID = Pattern.compile("[a-z0-9][a-z0-9-]{0,39}");

    private RemoteTemplates() {}

    public static boolean isRemoteCode(String code) {
        return code != null && code.startsWith(CODE_PREFIX);
    }

    public static boolean isValidId(JsonNode value) {
        return value != null && value.isString() && ID.matcher(value.asString()).matches();
    }

    /**
     * 페이지 설정 검사. 원격 속지 페이지(code 가 dio-remote-*)는 형식에 맞는 remoteTemplate 이 있어야 하고,
     * 다른 속지에는 remoteTemplate 을 둘 수 없다. 어긋나면 IllegalArgumentException(400).
     * code: 페이지의 속지 코드(템플릿 행 또는 설정의 templateCode). 모르면 null(설정의 templateCode 를 본다).
     */
    public static void requireValidConfig(JsonNode config, String code) {
        String effective = code != null ? code
            : config != null && config.path("templateCode").isString() ? config.get("templateCode").asString() : null;
        JsonNode value = config == null || !config.isObject() ? null : config.get(CONFIG_KEY);
        if (isRemoteCode(effective)) {
            if (!isValidId(value)) throw new IllegalArgumentException("원격 속지 페이지에는 형식에 맞는 remoteTemplate 이 필요합니다.");
        } else if (value != null) {
            throw new IllegalArgumentException("remoteTemplate 은 원격 속지 페이지에서만 쓸 수 있습니다.");
        }
    }
}
