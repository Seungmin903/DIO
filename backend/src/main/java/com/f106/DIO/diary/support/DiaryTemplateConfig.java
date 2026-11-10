package com.f106.DIO.diary.support;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 다이어리 단위 속지 구성(앱의 templateConfig: paper·sections·dateMode·orientation 등).
 * 페이지 배치는 페이지별 설정이 정하고, 이 값은 다른 기기의 속지 요약·첫 속지 미리보기·기본 표지 날짜 표시에만 쓴다.
 * 형식은 앱이 정하므로 서버는 크기와 깊이만 제한한 JSON 객체로 보관한다.
 */
public final class DiaryTemplateConfig {
    public static final int MAX_LENGTH = 32768;
    private static final int MAX_DEPTH = 12;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private DiaryTemplateConfig() {}

    /** 저장할 문자열. 객체가 아니거나 너무 크거나 깊으면 IllegalArgumentException. */
    public static String serialize(JsonNode value) {
        if (value == null || !value.isObject() || depth(value, 0) > MAX_DEPTH) throw invalid();
        String text = value.toString();
        if (text.length() > MAX_LENGTH) throw invalid();
        return text;
    }

    public static JsonNode read(String value) {
        return value == null ? null : JSON.readTree(value);
    }

    private static int depth(JsonNode value, int level) {
        if (level > MAX_DEPTH) return level;
        int max = level;
        if (value.isContainer()) for (JsonNode child : value.values()) max = Math.max(max, depth(child, level + 1));
        return max;
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("다이어리 속지 구성을 확인해 주세요.");
    }
}
