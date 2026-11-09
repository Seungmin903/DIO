package com.f106.DIO.sticker;

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
 * 꾸미기 공방 스티커 보관함(폴더 구성)을 계정에 저장한다. 스티커 이미지 자체는 /api/v1/media(STICKER)에 올라가 있고, 여기에는 그 id 와 폴더 구성만 둔다.
 * 문서 전체를 한 번에 바꾸며, 기기가 마지막으로 본 version(expectedVersion)이 지금과 다르면 409 로 막아 다른 기기의 변경을 덮지 않는다.
 */
@Service
@Transactional
public class StickerLibraryService {
    public record StickerItem(UUID mediaFileId, String builtin, String asset, String widget, String style, String emoji, String name, Double aspect) {}
    public record StickerFolder(String id, String name, List<StickerItem> items) {}
    public record StickerLibraryDocument(long version, List<StickerFolder> folders) {}

    static final int MAX_FOLDERS = 200, MAX_ITEMS = 3000, MAX_NAME = 40, MAX_TEXT = 200;
    private static final Pattern FOLDER_ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
    private static final TypeReference<List<StickerFolder>> FOLDERS = new TypeReference<>() {};
    private final JdbcTemplate jdbc;
    private final JsonMapper json = JsonMapper.builder().build();
    public StickerLibraryService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public StickerLibraryDocument get(long userId) {
        var rows = jdbc.query("select version, document_json from user_sticker_libraries where user_id=?",
            (rs, n) -> new StickerLibraryDocument(rs.getLong(1), json.readValue(rs.getString(2), FOLDERS)), userId);
        return rows.isEmpty() ? new StickerLibraryDocument(0, List.of()) : rows.get(0);
    }

    public StickerLibraryDocument replace(long userId, Long expectedVersion, List<StickerFolder> folders) {
        if (expectedVersion == null || expectedVersion < 0) throw StickerLibraryException.invalid("보관함 버전을 확인해 주세요.");
        List<StickerFolder> clean = normalize(folders);
        // 같은 계정의 저장을 한 줄씩 처리한다(행이 없으면 아래 insert 의 기본 키가 동시 생성을 막는다)
        var current = jdbc.queryForList("select version from user_sticker_libraries where user_id=? for update", Long.class, userId);
        long version = current.isEmpty() ? 0 : current.get(0);
        if (version != expectedVersion) throw StickerLibraryException.conflict();
        Set<UUID> media = new LinkedHashSet<>();
        for (StickerFolder folder : clean) for (StickerItem item : folder.items()) if (item.mediaFileId() != null) media.add(item.mediaFileId());
        requireOwnImages(userId, media);
        long next = version + 1;
        var now = java.sql.Timestamp.from(Instant.now());
        String document = json.writeValueAsString(clean);
        if (current.isEmpty()) {
            try { jdbc.update("insert into user_sticker_libraries(user_id, version, document_json, updated_at) values(?,?,?,?)", userId, next, document, now); }
            catch (DuplicateKeyException race) { throw StickerLibraryException.conflict(); }
        } else if (jdbc.update("update user_sticker_libraries set version=?, document_json=?, updated_at=? where user_id=? and version=?", next, document, now, userId, version) != 1) {
            throw StickerLibraryException.conflict();
        }
        jdbc.update("delete from user_sticker_library_media where user_id=?", userId);
        jdbc.batchUpdate("insert into user_sticker_library_media(user_id, media_file_id) values(?,?)",
            media.stream().map(id -> new Object[] {userId, id}).toList());
        return new StickerLibraryDocument(next, clean);
    }

    // 내 이미지(삭제 안 된 IMAGE)만 담는다. 남의 파일 id 를 넣어 내려받거나 정리를 막지 못하게 한다
    private void requireOwnImages(long userId, Set<UUID> media) {
        if (media.isEmpty()) return;
        List<UUID> ids = List.copyOf(media);
        for (int start = 0; start < ids.size(); start += 500) {
            List<UUID> part = ids.subList(start, Math.min(ids.size(), start + 500));
            String marks = String.join(",", Collections.nCopies(part.size(), "?"));
            List<Object> args = new ArrayList<>(part);
            args.add(0, userId); args.add(0, userId); // owner_user_id, kept.user_id
            // 이미 보관함에 있던 이미지는 사용자가 미디어에서 지웠어도 그대로 둘 수 있다(새로 넣는 것만 삭제 안 된 이미지여야 한다)
            Integer found = jdbc.queryForObject("select count(*) from media_files where owner_user_id=? and media_type='IMAGE' and status='READY'"
                + " and (deleted_at is null or exists (select 1 from user_sticker_library_media kept where kept.user_id=? and kept.media_file_id=media_files.media_file_id))"
                + " and media_file_id in (" + marks + ")", Integer.class, args.toArray());
            if (found == null || found != part.size()) throw StickerLibraryException.media();
        }
    }

    static List<StickerFolder> normalize(List<StickerFolder> folders) {
        if (folders == null) throw StickerLibraryException.invalid("폴더 목록이 필요합니다.");
        if (folders.size() > MAX_FOLDERS) throw StickerLibraryException.invalid("폴더는 " + MAX_FOLDERS + "개까지 저장할 수 있습니다.");
        Set<String> ids = new HashSet<>();
        int total = 0;
        List<StickerFolder> clean = new ArrayList<>();
        for (StickerFolder folder : folders) {
            if (folder == null || folder.id() == null || !FOLDER_ID.matcher(folder.id()).matches() || !ids.add(folder.id())) throw StickerLibraryException.invalid("폴더 id 를 확인해 주세요.");
            String name = text(folder.name(), MAX_NAME);
            if (name == null || name.isBlank()) throw StickerLibraryException.invalid("폴더 이름을 확인해 주세요.");
            List<StickerItem> items = folder.items() == null ? List.of() : folder.items();
            total += items.size();
            if (total > MAX_ITEMS) throw StickerLibraryException.invalid("스티커는 " + MAX_ITEMS + "개까지 저장할 수 있습니다.");
            List<StickerItem> cleanItems = new ArrayList<>();
            for (StickerItem item : items) cleanItems.add(item(item));
            clean.add(new StickerFolder(folder.id(), name, List.copyOf(cleanItems)));
        }
        return List.copyOf(clean);
    }

    private static StickerItem item(StickerItem item) {
        if (item == null) throw StickerLibraryException.invalid("스티커 정보를 확인해 주세요.");
        Double aspect = item.aspect();
        if (aspect != null && (!Double.isFinite(aspect) || aspect <= 0 || aspect > 100)) throw StickerLibraryException.invalid("스티커 비율을 확인해 주세요.");
        StickerItem clean = new StickerItem(item.mediaFileId(), text(item.builtin(), MAX_TEXT), text(item.asset(), MAX_TEXT), text(item.widget(), MAX_TEXT),
            text(item.style(), MAX_TEXT), text(item.emoji(), MAX_TEXT), text(item.name(), MAX_TEXT), aspect);
        if (clean.mediaFileId() == null && clean.builtin() == null && clean.asset() == null && clean.widget() == null && clean.emoji() == null)
            throw StickerLibraryException.invalid("스티커 정보를 확인해 주세요.");
        return clean;
    }

    // 글자(코드 포인트) 수로 제한한다. 넘으면 거절한다(잘라 저장하면 기기와 내용이 달라진다)
    private static String text(String value, int max) {
        if (value == null) return null;
        if (value.codePointCount(0, value.length()) > max || value.chars().anyMatch(Character::isISOControl)) throw StickerLibraryException.invalid("글자 수를 확인해 주세요.");
        return value;
    }
}
