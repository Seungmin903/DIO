package com.f106.DIO.cover;

import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 꾸미기 공방 내 표지 보관함(표지 목록)을 계정에 저장한다. 표지 사진 · 표지 스티커 이미지는 /api/v1/media 에 올라가 있고, 여기에는 표지 디자인과 그 안의 미디어 id 만 둔다.
 * 스티커 보관함과 같은 규칙: 문서 전체를 한 번에 바꾸며, 기기가 마지막으로 본 version(expectedVersion)이 지금과 다르면 409 로 막는다.
 * 표지 디자인(cover)은 앱(coverDesign.normalizeCover)이 읽을 때 맞추므로 여기서는 객체인지 · 크기 · 미디어 id 만 본다.
 */
@Service
@Transactional
public class CoverLibraryService {
    /** 내 표지 하나. cover 는 표지 디자인(바탕 · 사진 · 띠 · 제목 · 스티커 …) 그대로 */
    public record CoverEntry(String id, String name, String createdAt, String orientation, JsonNode cover) {}
    public record CoverLibraryDocument(long version, List<CoverEntry> covers) {}

    static final int MAX_COVERS = 100, MAX_NAME = 40, MAX_DATE = 40, MAX_COVER_BYTES = 64 * 1024, MAX_MEDIA_PER_COVER = 200;
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
    private static final Pattern UUID_TEXT = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Set<String> ORIENTATIONS = Set.of("portrait", "landscape");
    private static final String MEDIA_PREFIX = "media:";
    private static final TypeReference<List<CoverEntry>> COVERS = new TypeReference<>() {};
    private final JdbcTemplate jdbc;
    private final JsonMapper json = JsonMapper.builder().build();
    public CoverLibraryService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public CoverLibraryDocument get(long userId) {
        var rows = jdbc.query("select version, document_json from user_cover_libraries where user_id=?",
            (rs, n) -> new CoverLibraryDocument(rs.getLong(1), json.readValue(rs.getString(2), COVERS)), userId);
        return rows.isEmpty() ? new CoverLibraryDocument(0, List.of()) : rows.get(0);
    }

    public CoverLibraryDocument replace(long userId, Long expectedVersion, List<CoverEntry> covers) {
        if (expectedVersion == null || expectedVersion < 0) throw CoverLibraryException.invalid("보관함 버전을 확인해 주세요.");
        List<CoverEntry> clean = normalize(covers);
        Set<UUID> media = new LinkedHashSet<>();
        for (CoverEntry entry : clean) collectMedia(entry.cover(), media, new int[] {0});
        // 같은 계정의 저장을 한 줄씩 처리한다(행이 없으면 아래 insert 의 기본 키가 동시 생성을 막는다)
        var current = jdbc.queryForList("select version from user_cover_libraries where user_id=? for update", Long.class, userId);
        long version = current.isEmpty() ? 0 : current.get(0);
        if (version != expectedVersion) throw CoverLibraryException.conflict();
        requireOwnImages(userId, media);
        long next = version + 1;
        var now = java.sql.Timestamp.from(Instant.now());
        String document = json.writeValueAsString(clean);
        if (current.isEmpty()) {
            try { jdbc.update("insert into user_cover_libraries(user_id, version, document_json, updated_at) values(?,?,?,?)", userId, next, document, now); }
            catch (DuplicateKeyException race) { throw CoverLibraryException.conflict(); }
        } else if (jdbc.update("update user_cover_libraries set version=?, document_json=?, updated_at=? where user_id=? and version=?", next, document, now, userId, version) != 1) {
            throw CoverLibraryException.conflict();
        }
        jdbc.update("delete from user_cover_library_media where user_id=?", userId);
        jdbc.batchUpdate("insert into user_cover_library_media(user_id, media_file_id) values(?,?)",
            media.stream().map(id -> new Object[] {userId, id}).toList());
        return new CoverLibraryDocument(next, clean);
    }

    // 내 이미지(삭제 안 된 IMAGE)만 담는다. 이미 보관함에 있던 이미지는 미디어에서 지웠어도 그대로 둘 수 있다
    private void requireOwnImages(long userId, Set<UUID> media) {
        if (media.isEmpty()) return;
        List<UUID> ids = List.copyOf(media);
        for (int start = 0; start < ids.size(); start += 500) {
            List<UUID> part = ids.subList(start, Math.min(ids.size(), start + 500));
            String marks = String.join(",", Collections.nCopies(part.size(), "?"));
            List<Object> args = new ArrayList<>(part);
            args.add(0, userId); args.add(0, userId); // owner_user_id, kept.user_id
            Integer found = jdbc.queryForObject("select count(*) from media_files where owner_user_id=? and media_type='IMAGE' and status='READY'"
                + " and (deleted_at is null or exists (select 1 from user_cover_library_media kept where kept.user_id=? and kept.media_file_id=media_files.media_file_id))"
                + " and media_file_id in (" + marks + ")", Integer.class, args.toArray());
            if (found == null || found != part.size()) throw CoverLibraryException.media();
        }
    }

    static List<CoverEntry> normalize(List<CoverEntry> covers) {
        if (covers == null) throw CoverLibraryException.invalid("표지 목록이 필요합니다.");
        if (covers.size() > MAX_COVERS) throw CoverLibraryException.invalid("내 표지는 " + MAX_COVERS + "개까지 저장할 수 있습니다.");
        Set<String> ids = new HashSet<>();
        List<CoverEntry> clean = new ArrayList<>();
        JsonMapper writer = JsonMapper.builder().build();
        for (CoverEntry entry : covers) {
            if (entry == null || entry.id() == null || !ID.matcher(entry.id()).matches() || !ids.add(entry.id())) throw CoverLibraryException.invalid("표지 id 를 확인해 주세요.");
            String name = text(entry.name(), MAX_NAME);
            if (name == null || name.isBlank()) throw CoverLibraryException.invalid("표지 이름을 확인해 주세요.");
            if (entry.orientation() == null || !ORIENTATIONS.contains(entry.orientation())) throw CoverLibraryException.invalid("표지 방향을 확인해 주세요.");
            if (entry.cover() == null || !entry.cover().isObject()) throw CoverLibraryException.invalid("표지 디자인을 확인해 주세요.");
            if (writer.writeValueAsBytes(entry.cover()).length > MAX_COVER_BYTES) throw CoverLibraryException.invalid("표지 디자인이 너무 큽니다.");
            clean.add(new CoverEntry(entry.id(), name, text(entry.createdAt(), MAX_DATE), entry.orientation(), entry.cover()));
        }
        return List.copyOf(clean);
    }

    // 표지 안 어디든 mediaFileId 칸은 미디어 id(UUID)여야 한다(표지 사진 · 스티커). 그 밖의 칸은 앱이 읽을 때 맞춘다.
    // src 가 미디어 참조(media:…)면 같은 객체의 mediaFileId 를 가리켜야 한다(소유권 검사를 거치지 않은 다른 미디어를 src 로 끼워 넣지 못하게)
    private static void collectMedia(JsonNode node, Set<UUID> media, int[] count) {
        if (node == null) return;
        if (node.isArray()) { for (JsonNode child : node) collectMedia(child, media, count); return; }
        if (!node.isObject()) return;
        JsonNode src = node.get("src"), id = node.get("mediaFileId");
        if (src != null && src.isString() && src.asString().startsWith(MEDIA_PREFIX)
            && (id == null || !id.isString() || !src.asString().equalsIgnoreCase(MEDIA_PREFIX + id.asString())))
            throw CoverLibraryException.invalid("표지 그림 참조를 확인해 주세요.");
        for (var field : node.properties()) {
            JsonNode value = field.getValue();
            if ("mediaFileId".equals(field.getKey())) {
                if (value == null || value.isNull()) continue;
                if (!value.isString() || !UUID_TEXT.matcher(value.asString()).matches()) throw CoverLibraryException.invalid("표지 그림 id 를 확인해 주세요.");
                if (++count[0] > MAX_MEDIA_PER_COVER) throw CoverLibraryException.invalid("표지 그림이 너무 많습니다.");
                media.add(UUID.fromString(value.asString()));
            } else collectMedia(value, media, count);
        }
    }

    // 글자(코드 포인트) 수로 제한한다. 넘으면 거절한다(잘라 저장하면 기기와 내용이 달라진다)
    private static String text(String value, int max) {
        if (value == null) return null;
        if (value.codePointCount(0, value.length()) > max || value.chars().anyMatch(Character::isISOControl)) throw CoverLibraryException.invalid("글자 수를 확인해 주세요.");
        return value;
    }
}
