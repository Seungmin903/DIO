package com.f106.DIO.tape;

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
 * 꾸미기 공방 테이프 보관함(폴더 구성)을 계정에 저장한다. 사진 테이프 이미지는 /api/v1/media(TAPE)에 올라가 있고, 여기에는 그 id 와 자른 자리 · 폴더 구성만 둔다.
 * 스티커 보관함(StickerLibraryService)과 같은 규칙: 문서 전체를 한 번에 바꾸며, 기기가 마지막으로 본 version(expectedVersion)이 지금과 다르면 409 로 막는다.
 */
@Service
@Transactional
public class TapeLibraryService {
    @org.springframework.beans.factory.annotation.Autowired private com.f106.DIO.inventory.InventoryLimits inventory;
    /** 자른 자리(TapeCropper): fx · fy 0~1, zoom 1 이상 */
    public record TapeCrop(Double fx, Double fy, Double zoom) {}
    /** 폴더 안 테이프 하나. 사진 테이프는 mediaFileId, 기본 무늬는 pattern(+palette) */
    public record TapeItem(String id, UUID mediaFileId, String pattern, String palette, String name,
                           Double imageWidth, Double imageHeight, TapeCrop crop, String size, Double pieceRatio) {}
    public record TapeFolder(String id, String name, List<TapeItem> items) {}
    public record TapeLibraryDocument(long version, List<TapeFolder> folders) {}

    static final int MAX_FOLDERS = 200, MAX_ITEMS = 3000, MAX_NAME = 40, MAX_TEXT = 200;
    static final double MAX_IMAGE_SIDE = 100_000, MAX_RATIO = 100, MAX_ZOOM = 1_000;
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
    private static final TypeReference<List<TapeFolder>> FOLDERS = new TypeReference<>() {};
    private final JdbcTemplate jdbc;
    private final JsonMapper json = JsonMapper.builder().build();
    public TapeLibraryService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public TapeLibraryDocument get(long userId) {
        var rows = jdbc.query("select version, document_json from user_tape_libraries where user_id=?",
            (rs, n) -> new TapeLibraryDocument(rs.getLong(1), json.readValue(rs.getString(2), FOLDERS)), userId);
        return rows.isEmpty() ? new TapeLibraryDocument(0, List.of()) : rows.get(0);
    }

    public TapeLibraryDocument replace(long userId, Long expectedVersion, List<TapeFolder> folders) {
        if (expectedVersion == null || expectedVersion < 0) throw TapeLibraryException.invalid("보관함 버전을 확인해 주세요.");
        List<TapeFolder> clean = normalize(folders);
        // 같은 계정의 저장을 한 줄씩 처리한다(행이 없으면 아래 insert 의 기본 키가 동시 생성을 막는다)
        var current = jdbc.queryForList("select version from user_tape_libraries where user_id=? for update", Long.class, userId);
        long version = current.isEmpty() ? 0 : current.get(0);
        if (version != expectedVersion) throw TapeLibraryException.conflict();
        Set<UUID> media = new LinkedHashSet<>();
        for (TapeFolder folder : clean) for (TapeItem item : folder.items()) if (item.mediaFileId() != null) media.add(item.mediaFileId());
        var before=inventory.mediaItems(userId,com.f106.DIO.inventory.InventoryLimits.Kind.TAPE);
        var removed=new HashSet<>(jdbc.queryForList("select media_file_id from user_tape_library_media where user_id=?",UUID.class,userId));
        removed.removeAll(media);
        requireOwnImages(userId, media);
        long next = version + 1;
        var now = java.sql.Timestamp.from(Instant.now());
        String document = json.writeValueAsString(clean);
        if (current.isEmpty()) {
            try { jdbc.update("insert into user_tape_libraries(user_id, version, document_json, updated_at) values(?,?,?,?)", userId, next, document, now); }
            catch (DuplicateKeyException race) { throw TapeLibraryException.conflict(); }
        } else if (jdbc.update("update user_tape_libraries set version=?, document_json=?, updated_at=? where user_id=? and version=?", next, document, now, userId, version) != 1) {
            throw TapeLibraryException.conflict();
        }
        jdbc.update("delete from user_tape_library_media where user_id=?", userId);
        jdbc.batchUpdate("insert into user_tape_library_media(user_id, media_file_id) values(?,?)",
            media.stream().map(id -> new Object[] {userId, id}).toList());
        inventory.releaseLibraryMedia(userId,"TAPE",removed);
        inventory.validateLibrary(userId,com.f106.DIO.inventory.InventoryLimits.Kind.TAPE,before);
        return new TapeLibraryDocument(next, clean);
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
                + " and (deleted_at is null or exists (select 1 from user_tape_library_media kept where kept.user_id=? and kept.media_file_id=media_files.media_file_id))"
                + " and media_file_id in (" + marks + ")", Integer.class, args.toArray());
            if (found == null || found != part.size()) throw TapeLibraryException.media();
        }
    }

    static List<TapeFolder> normalize(List<TapeFolder> folders) {
        if (folders == null) throw TapeLibraryException.invalid("폴더 목록이 필요합니다.");
        if (folders.size() > MAX_FOLDERS) throw TapeLibraryException.invalid("폴더는 " + MAX_FOLDERS + "개까지 저장할 수 있습니다.");
        Set<String> ids = new HashSet<>();
        int total = 0;
        Map<String,TapeItem> identities = new HashMap<>();
        List<TapeFolder> clean = new ArrayList<>();
        for (TapeFolder folder : folders) {
            if (folder == null || folder.id() == null || !ID.matcher(folder.id()).matches() || !ids.add(folder.id())) throw TapeLibraryException.invalid("폴더 id 를 확인해 주세요.");
            String name = text(folder.name(), MAX_NAME);
            if (name == null || name.isBlank()) throw TapeLibraryException.invalid("폴더 이름을 확인해 주세요.");
            List<TapeItem> items = folder.items() == null ? List.of() : folder.items();
            total += items.size();
            if (total > MAX_ITEMS) throw TapeLibraryException.invalid("테이프는 " + MAX_ITEMS + "개까지 저장할 수 있습니다.");
            List<TapeItem> cleanItems = new ArrayList<>();
            for (TapeItem item : items) {
                TapeItem normalized=item(item);
                if(normalized.id()!=null){
                    TapeItem previous=identities.putIfAbsent(normalized.id(),normalized);
                    if(previous!=null&&!previous.equals(normalized))throw TapeLibraryException.invalid("같은 테이프 id에는 같은 내용을 전달해 주세요.");
                }
                cleanItems.add(normalized);
            }
            clean.add(new TapeFolder(folder.id(), name, List.copyOf(cleanItems)));
        }
        return List.copyOf(clean);
    }

    private static TapeItem item(TapeItem item) {
        if (item == null) throw TapeLibraryException.invalid("테이프 정보를 확인해 주세요.");
        if (item.id() != null && !ID.matcher(item.id()).matches()) throw TapeLibraryException.invalid("테이프 id 를 확인해 주세요.");
        TapeCrop crop = item.crop();
        if (crop != null && !(unit(crop.fx()) && unit(crop.fy()) && crop.zoom() != null && Double.isFinite(crop.zoom()) && crop.zoom() >= 1 && crop.zoom() <= MAX_ZOOM))
            throw TapeLibraryException.invalid("테이프 자른 자리를 확인해 주세요.");
        if (!positive(item.imageWidth(), MAX_IMAGE_SIDE) || !positive(item.imageHeight(), MAX_IMAGE_SIDE) || !positive(item.pieceRatio(), MAX_RATIO))
            throw TapeLibraryException.invalid("테이프 크기를 확인해 주세요.");
        TapeItem clean = new TapeItem(item.id(), item.mediaFileId(), text(item.pattern(), MAX_TEXT), text(item.palette(), MAX_TEXT), text(item.name(), MAX_TEXT),
            item.imageWidth(), item.imageHeight(), crop, text(item.size(), MAX_TEXT), item.pieceRatio());
        if (clean.mediaFileId() == null && (clean.pattern() == null || clean.pattern().isEmpty())) throw TapeLibraryException.invalid("테이프 정보를 확인해 주세요.");
        return clean;
    }

    private static boolean unit(Double value) { return value != null && Double.isFinite(value) && value >= 0 && value <= 1; }
    // 없으면 통과, 있으면 0 초과 max 이하의 유한한 수
    private static boolean positive(Double value, double max) { return value == null || (Double.isFinite(value) && value > 0 && value <= max); }

    // 글자(코드 포인트) 수로 제한한다. 넘으면 거절한다(잘라 저장하면 기기와 내용이 달라진다)
    private static String text(String value, int max) {
        if (value == null) return null;
        if (value.codePointCount(0, value.length()) > max || value.chars().anyMatch(Character::isISOControl)) throw TapeLibraryException.invalid("글자 수를 확인해 주세요.");
        return value;
    }
}
