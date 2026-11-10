package com.f106.DIO.palette;

import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 꾸미기 공방 도구 탭 팔레트(펜 · 형광펜 · 테이프 · 글자 · 종이 · 줄 색의 고정 칸)를 계정에 저장한다.
 * 문서 전체를 한 번에 바꾸며, 기기가 마지막으로 본 version(expectedVersion)이 지금과 다르면 409 로 막아 다른 기기의 변경을 덮지 않는다.
 * 도구 이름은 앱이 정한다(새 도구가 생겨도 서버를 바꾸지 않게 이름 형식만 본다). 문서에 없는 도구는 앱 기본 색이다.
 */
@Service
@Transactional
public class PaletteService {
    public record PaletteDocument(long version, Map<String, List<String>> palettes) {}

    static final int MAX_SCOPES = 32, MAX_SLOTS = 64;
    private static final Pattern SCOPE = Pattern.compile("^[A-Za-z][A-Za-z0-9]{0,31}$");
    // 테이프는 기본 색 id('pink') · 사용자 색('custom:#바탕:#무늬'), 그 밖의 도구는 '#RRGGBB'만(앱 normalizePaletteEntry 와 같은 규칙)
    static final String TAPE = "tape";
    private static final Pattern COLOR = Pattern.compile("^#[0-9A-Fa-f]{6}$");
    private static final Pattern TAPE_ENTRY = Pattern.compile("^([a-z][a-z0-9_-]{0,31}|custom:#[0-9A-Fa-f]{6}:#[0-9A-Fa-f]{6})$");
    private static final TypeReference<Map<String, List<String>>> PALETTES = new TypeReference<>() {};
    private final JdbcTemplate jdbc;
    private final JsonMapper json = JsonMapper.builder().build();
    public PaletteService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public PaletteDocument get(long userId) {
        var rows = jdbc.query("select version, document_json from user_palettes where user_id=?",
            (rs, n) -> new PaletteDocument(rs.getLong(1), json.readValue(rs.getString(2), PALETTES)), userId);
        return rows.isEmpty() ? new PaletteDocument(0, Map.of()) : rows.get(0);
    }

    public PaletteDocument replace(long userId, Long expectedVersion, Map<String, List<String>> palettes) {
        if (expectedVersion == null || expectedVersion < 0) throw PaletteException.invalid("팔레트 버전을 확인해 주세요.");
        Map<String, List<String>> clean = normalize(palettes);
        // 같은 계정의 저장을 한 줄씩 처리한다(행이 없으면 아래 insert 의 기본 키가 동시 생성을 막는다)
        var current = jdbc.queryForList("select version from user_palettes where user_id=? for update", Long.class, userId);
        long version = current.isEmpty() ? 0 : current.get(0);
        if (version != expectedVersion) throw PaletteException.conflict();
        long next = version + 1;
        var now = java.sql.Timestamp.from(Instant.now());
        String document = json.writeValueAsString(clean);
        if (current.isEmpty()) {
            try { jdbc.update("insert into user_palettes(user_id, version, document_json, updated_at) values(?,?,?,?)", userId, next, document, now); }
            catch (DuplicateKeyException race) { throw PaletteException.conflict(); }
        } else if (jdbc.update("update user_palettes set version=?, document_json=?, updated_at=? where user_id=? and version=?", next, document, now, userId, version) != 1) {
            throw PaletteException.conflict();
        }
        return new PaletteDocument(next, clean);
    }

    static Map<String, List<String>> normalize(Map<String, List<String>> palettes) {
        if (palettes == null) throw PaletteException.invalid("팔레트 목록이 필요합니다.");
        if (palettes.size() > MAX_SCOPES) throw PaletteException.invalid("팔레트는 " + MAX_SCOPES + "종류까지 저장할 수 있습니다.");
        Map<String, List<String>> clean = new TreeMap<>();
        for (var entry : palettes.entrySet()) {
            String scope = entry.getKey();
            List<String> colors = entry.getValue();
            if (scope == null || !SCOPE.matcher(scope).matches()) throw PaletteException.invalid("팔레트 이름을 확인해 주세요.");
            if (colors == null || colors.isEmpty() || colors.size() > MAX_SLOTS) throw PaletteException.invalid("팔레트 칸은 1~" + MAX_SLOTS + "개입니다.");
            Pattern entryFormat = TAPE.equals(scope) ? TAPE_ENTRY : COLOR;
            for (String color : colors) if (color == null || !entryFormat.matcher(color).matches()) throw PaletteException.invalid("팔레트 색을 확인해 주세요.");
            clean.put(scope, List.copyOf(colors));
        }
        return Collections.unmodifiableMap(clean);
    }
}
