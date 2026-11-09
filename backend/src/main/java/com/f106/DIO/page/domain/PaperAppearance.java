package com.f106.DIO.page.domain;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** The printed fonts bundled by the app and the two paper colors. */
public final class PaperAppearance {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final List<String> COLORS = List.of("backgroundColor", "layoutColor");
    private static final Set<String> FONTS = Set.of("maruburi", "nanum-gothic", "nanum-myeongjo",
        "gowun-batang", "gowun-dodum", "nanum-pen", "poor-story");

    private PaperAppearance() {}

    public static ObjectNode normalize(JsonNode value) {
        if (!value.isObject()) throw invalid();
        var result = JSON.createObjectNode();
        for (var field : value.properties()) {
            String key = field.getKey();
            JsonNode entry = field.getValue();
            if (!entry.isString()) throw invalid();
            String text = entry.asString();
            if (COLORS.contains(key) && text.matches("#[0-9a-fA-F]{6}")) {
                result.put(key, text.toUpperCase(Locale.ROOT));
            } else if ("font".equals(key) && FONTS.contains(text)) {
                result.put(key, text);
            } else {
                throw invalid();
            }
        }
        return result;
    }

    public static JsonNode read(String value) {
        return value == null ? null : JSON.readTree(value);
    }

    public static String inPageConfig(String config, JsonNode appearance) {
        var value = config == null ? JSON.createObjectNode() : JSON.readTree(config);
        if (!(value instanceof ObjectNode object)) throw invalid();
        object.set("paperAppearance", appearance);
        return object.toString();
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("속지 색과 글꼴 설정을 확인해 주세요.");
    }
}
