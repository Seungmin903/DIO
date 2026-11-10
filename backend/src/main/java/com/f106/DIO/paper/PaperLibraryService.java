package com.f106.DIO.paper;

import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * 꾸미기 공방 내 속지 보관함(PDF 로 만든 속지 묶음 목록)과 새 다이어리의 기본 속지 스타일을 계정에 저장한다.
 * 쪽 그림은 /api/v1/media 에 올라가 있고, 여기에는 묶음 정보와 쪽마다 미디어 id 만 둔다.
 * 스티커 · 테이프 보관함 · 내 표지와 같은 규칙: 문서 전체를 한 번에 바꾸며, 기기가 마지막으로 본 version(expectedVersion)이 지금과 다르면 409 로 막는다.
 */
@Service
@Transactional
public class PaperLibraryService {
    /** 속지 묶음 안의 한 쪽. 그림은 mediaFileId, aspect 는 가로/세로 비율 */
    public record PaperPage(String mediaFileId, Double aspect, String name) {}
    /** 내 속지 묶음 하나 */
    public record PaperEntry(String id, String name, String createdAt, String orientation, List<PaperPage> pages) {}
    /** 기본 속지 스타일(종이 색 · 선 색 · 글꼴). 글꼴은 고른 때만 */
    public record PaperStyle(String backgroundColor, String layoutColor, String font) {}
    public record PaperLibraryDocument(long version, List<PaperEntry> papers, PaperStyle style) {}
    private record Stored(List<PaperEntry> papers, PaperStyle style) {}

    static final int MAX_PAPERS = 100, MAX_PAGES = 100, MAX_NAME = 40, MAX_DATE = 40;
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
    private static final Pattern FONT = Pattern.compile("^[A-Za-z0-9_-]{1,40}$");
    private static final Pattern COLOR = Pattern.compile("^#[0-9A-Fa-f]{6}$");
    private static final Pattern UUID_TEXT = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Set<String> ORIENTATIONS = Set.of("portrait", "landscape");
    private final JdbcTemplate jdbc;
    private final JsonMapper json = JsonMapper.builder().build();
    public PaperLibraryService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public PaperLibraryDocument get(long userId) {
        var rows = jdbc.query("select version, document_json from user_paper_libraries where user_id=?", (rs, n) -> {
            Stored stored = json.readValue(rs.getString(2), Stored.class);
            return new PaperLibraryDocument(rs.getLong(1), stored.papers() == null ? List.of() : stored.papers(), stored.style());
        }, userId);
        return rows.isEmpty() ? new PaperLibraryDocument(0, List.of(), null) : rows.get(0);
    }

    public PaperLibraryDocument replace(long userId, Long expectedVersion, List<PaperEntry> papers, PaperStyle style) {
        if (expectedVersion == null || expectedVersion < 0) throw PaperLibraryException.invalid("보관함 버전을 확인해 주세요.");
        List<PaperEntry> clean = normalize(papers);
        PaperStyle cleanStyle = normalizeStyle(style);
        Set<UUID> media = new LinkedHashSet<>();
        for (PaperEntry entry : clean) for (PaperPage page : entry.pages()) media.add(UUID.fromString(page.mediaFileId()));
        // 같은 계정의 저장을 한 줄씩 처리한다(행이 없으면 아래 insert 의 기본 키가 동시 생성을 막는다)
        var current = jdbc.queryForList("select version from user_paper_libraries where user_id=? for update", Long.class, userId);
        long version = current.isEmpty() ? 0 : current.get(0);
        if (version != expectedVersion) throw PaperLibraryException.conflict();
        requireOwnImages(userId, media);
        long next = version + 1;
        var now = java.sql.Timestamp.from(Instant.now());
        String document = json.writeValueAsString(new Stored(clean, cleanStyle));
        if (current.isEmpty()) {
            try { jdbc.update("insert into user_paper_libraries(user_id, version, document_json, updated_at) values(?,?,?,?)", userId, next, document, now); }
            catch (DuplicateKeyException race) { throw PaperLibraryException.conflict(); }
        } else if (jdbc.update("update user_paper_libraries set version=?, document_json=?, updated_at=? where user_id=? and version=?", next, document, now, userId, version) != 1) {
            throw PaperLibraryException.conflict();
        }
        jdbc.update("delete from user_paper_library_media where user_id=?", userId);
        jdbc.batchUpdate("insert into user_paper_library_media(user_id, media_file_id) values(?,?)",
            media.stream().map(id -> new Object[] {userId, id}).toList());
        return new PaperLibraryDocument(next, clean, cleanStyle);
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
                + " and (deleted_at is null or exists (select 1 from user_paper_library_media kept where kept.user_id=? and kept.media_file_id=media_files.media_file_id))"
                + " and media_file_id in (" + marks + ")", Integer.class, args.toArray());
            if (found == null || found != part.size()) throw PaperLibraryException.media();
        }
    }

    static List<PaperEntry> normalize(List<PaperEntry> papers) {
        if (papers == null) throw PaperLibraryException.invalid("속지 목록이 필요합니다.");
        if (papers.size() > MAX_PAPERS) throw PaperLibraryException.invalid("내 속지는 " + MAX_PAPERS + "개까지 저장할 수 있습니다.");
        Set<String> ids = new HashSet<>();
        List<PaperEntry> clean = new ArrayList<>();
        for (PaperEntry entry : papers) {
            if (entry == null || entry.id() == null || !ID.matcher(entry.id()).matches() || !ids.add(entry.id())) throw PaperLibraryException.invalid("속지 id 를 확인해 주세요.");
            String name = text(entry.name(), MAX_NAME);
            if (name == null || name.isBlank()) throw PaperLibraryException.invalid("속지 이름을 확인해 주세요.");
            if (entry.orientation() == null || !ORIENTATIONS.contains(entry.orientation())) throw PaperLibraryException.invalid("속지 방향을 확인해 주세요.");
            if (entry.pages() == null || entry.pages().isEmpty() || entry.pages().size() > MAX_PAGES) throw PaperLibraryException.invalid("속지 쪽 수를 확인해 주세요.");
            List<PaperPage> pages = new ArrayList<>();
            for (PaperPage page : entry.pages()) {
                if (page == null || page.mediaFileId() == null || !UUID_TEXT.matcher(page.mediaFileId()).matches()) throw PaperLibraryException.invalid("속지 그림 id 를 확인해 주세요.");
                if (page.aspect() == null || !Double.isFinite(page.aspect()) || page.aspect() <= 0 || page.aspect() > 100) throw PaperLibraryException.invalid("속지 쪽 비율을 확인해 주세요.");
                pages.add(new PaperPage(page.mediaFileId(), page.aspect(), text(page.name(), MAX_NAME)));
            }
            clean.add(new PaperEntry(entry.id(), name, text(entry.createdAt(), MAX_DATE), entry.orientation(), List.copyOf(pages)));
        }
        return List.copyOf(clean);
    }

    // 스타일을 고른 적이 없으면 null(앱은 원래 기본값을 쓴다)
    static PaperStyle normalizeStyle(PaperStyle style) {
        if (style == null) return null;
        if (style.backgroundColor() == null || !COLOR.matcher(style.backgroundColor()).matches()
            || style.layoutColor() == null || !COLOR.matcher(style.layoutColor()).matches()) throw PaperLibraryException.invalid("속지 색을 확인해 주세요.");
        if (style.font() != null && !FONT.matcher(style.font()).matches()) throw PaperLibraryException.invalid("속지 글꼴을 확인해 주세요.");
        return new PaperStyle(style.backgroundColor().toUpperCase(Locale.ROOT), style.layoutColor().toUpperCase(Locale.ROOT), style.font());
    }

    // 글자(코드 포인트) 수로 제한한다. 넘으면 거절한다(잘라 저장하면 기기와 내용이 달라진다)
    private static String text(String value, int max) {
        if (value == null) return null;
        if (value.codePointCount(0, value.length()) > max || value.chars().anyMatch(Character::isISOControl)) throw PaperLibraryException.invalid("글자 수를 확인해 주세요.");
        return value;
    }
}
