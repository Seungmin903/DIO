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
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(DiaryTemplateConfig.class);

    private DiaryTemplateConfig() {}

    /** 저장할 문자열. 객체가 아니거나 너무 크거나 깊으면 IllegalArgumentException. */
    public static String serialize(JsonNode value) {
        if (value == null || !value.isObject() || depth(value, 0) > MAX_DEPTH) throw invalid();
        String text = value.toString();
        if (text.length() > MAX_LENGTH) throw invalid();
        return text;
    }

    /** 저장 값을 그대로 읽는다. 깨진 값은 예외(JacksonException)를 던진다. 손상을 드러내야 하는 곳에서 쓴다. */
    public static JsonNode read(String value) {
        return value == null ? null : JSON.readTree(value);
    }

    /**
     * 응답·비교용 관용 읽기. 저장 값이 없거나 깨졌거나 객체가 아니면 null(예전 다이어리와 같게)로 본다.
     * 목록·상세·휴지통 행 매퍼에서 써서 다이어리 한 건의 손상된 값 때문에 목록 전체가 실패하지 않게 한다.
     * 앱도 객체가 아닌 값은 응답 오류로 보므로 객체만 내보낸다. 결과를 다시 저장하는 데 쓰지 않는다.
     * 손상은 다이어리 ID와 사유만 warn으로 남기고(저장 값은 남기지 않는다), 같은 다이어리는 한 시간에 한 번만 남긴다.
     */
    public static JsonNode readLenient(String value, Object diaryId) {
        if (value == null) return null;
        JsonNode node;
        try {
            node = JSON.readTree(value);
        } catch (tools.jackson.core.JacksonException e) {
            warnOnce(diaryId, "PARSE_FAILED", e.getClass().getSimpleName());
            return null;
        }
        if (node == null || !node.isObject()) {
            warnOnce(diaryId, "NOT_OBJECT", node == null ? "NONE" : String.valueOf(node.getNodeType()));
            return null;
        }
        return node;
    }

    private static final long WARN_INTERVAL_NANOS = java.util.concurrent.TimeUnit.HOURS.toNanos(1);
    private static final int MAX_WARNED = 1024;
    private static final java.util.concurrent.ConcurrentHashMap<String, Long> WARNED = new java.util.concurrent.ConcurrentHashMap<>();

    private static void warnOnce(Object diaryId, String reason, String detail) {
        String key = String.valueOf(diaryId);
        long now = System.nanoTime();
        Long last = WARNED.get(key);
        if (last != null && now - last < WARN_INTERVAL_NANOS) return;
        if (WARNED.size() >= MAX_WARNED) WARNED.clear(); // 손상 행이 아주 많아도 메모리가 늘지 않게 한다.
        if (last == null ? WARNED.putIfAbsent(key, now) != null : !WARNED.replace(key, last, now)) return;
        LOG.warn("Stored diary templateConfig ignored: diaryId={} reason={} detail={}", key, reason, detail);
    }

    /** 테스트용: 경고 억제 기록을 비운다. */
    static void resetWarnings() { WARNED.clear(); }

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
