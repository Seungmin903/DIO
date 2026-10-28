package com.f106.DIO.diary.read;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.f106.DIO.diary.read.DiaryReadDtos.*;

/** 기존 스키마를 읽기만 한다. OWNER 원장은 diaries, 참여·탈퇴·즐겨찾기는 diary_members다. */
@Service
@Transactional(readOnly = true)
public class DiaryReadService {
    private final NamedParameterJdbcTemplate jdbc;
    private final com.f106.DIO.diary.trash.DiaryTime time;
    public DiaryReadService(NamedParameterJdbcTemplate jdbc, com.f106.DIO.diary.trash.DiaryTime time) { this.jdbc = jdbc; this.time=time; }
    private static final String ROWS = """
        select d.*, case when d.owner_user_id = :user then 'OWNER' else 'EDITOR' end as my_role,
          coalesce(m.is_favorite, false) as favorite,
          (select count(*) from pages p where p.diary_id=d.diary_id and p.deleted_at is null) as page_count,
          (select p.page_id from pages p where p.diary_id=d.diary_id and p.deleted_at is null
             order by p.sort_key, p.page_id limit 1) as first_page_id
        from diaries d left join diary_members m on m.diary_id=d.diary_id and m.user_id=:user
        where d.owner_user_id is not null and (
          (d.owner_user_id=:user and (m.user_id is null or (m.left_at is null and m.role in ('OWNER','EDITOR'))))
          or (m.role='EDITOR' and m.left_at is null))
        """;

    public Page list(long user, String status, String filter, String q, String sort, boolean favorite, int limit, String cursor) {
        if (!Set.of("active", "trashed").contains(status) || !Set.of("all", "personal", "shared").contains(filter)
            || !Set.of("updatedAtDesc", "createdAtDesc", "titleAsc", "pageCountDesc").contains(sort)
            || limit < 1 || limit > 100 || q.length() > 100 || q.chars().anyMatch(Character::isISOControl)) throw DiaryReadException.invalid();
        q = q.strip();
        String binding = fingerprint(user + "\n" + status + "\n" + filter + "\n" + q + "\n" + sort + "\n" + favorite);
        var params = new MapSqlParameterSource("user", user).addValue("take", limit + 1);
        String where = status.equals("trashed") ? "r.deleted_at is not null and r.my_role='OWNER'" : "r.deleted_at is null";
        // LINKS do not bypass membership. Classification follows the explicit visibility metadata.
        if (filter.equals("personal")) where += " and r.visibility='PRIVATE'";
        if (filter.equals("shared")) where += " and r.visibility in ('MEMBERS','LINK')";
        if (favorite) where += " and r.favorite=true";
        if (!q.isEmpty()) {
            where += " and lower(r.title) like :query escape '!'";
            params.addValue("query", "%" + q.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
        }
        String column = switch (sort) { case "createdAtDesc" -> "r.created_at"; case "titleAsc" -> "lower(r.title)";
            case "pageCountDesc" -> "r.page_count"; default -> "r.updated_at"; };
        boolean ascending = sort.equals("titleAsc");
        if (cursor != null) {
            try {
                if (cursor.length() > 2048) throw new IllegalArgumentException();
                String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\n", -1);
                if (parts.length != 4 || !parts[0].equals("1") || !parts[1].equals(binding)) throw new IllegalArgumentException();
                if (!parts[2].startsWith("k:")) throw new IllegalArgumentException();
                String value = new String(Base64.getUrlDecoder().decode(parts[2].substring(2)), StandardCharsets.UTF_8);
                Object key = switch (sort) { case "titleAsc" -> value; case "pageCountDesc" -> Long.parseLong(value);
                    default -> Timestamp.from(Instant.parse(value)); };
                params.addValue("cursorKey", key).addValue("cursorId", uuid(parts[3]));
                where += " and (" + column + (ascending ? ">" : "<") + ":cursorKey or (" + column + "=:cursorKey and r.diary_id<:cursorId))";
            } catch (RuntimeException error) { throw DiaryReadException.cursor(); }
        }
        var rows = jdbc.query("select r.*, " + column + " as cursor_key from (" + ROWS + ") r where " + where
            + " order by " + column + (ascending ? " asc" : " desc") + ", r.diary_id desc limit :take", params,
            (rs, index) -> new Row(item(rs), switch (sort) { case "titleAsc" -> rs.getString("cursor_key");
                case "pageCountDesc" -> Long.toString(rs.getLong("cursor_key")); default -> instant(rs, "cursor_key").toString(); }));
        boolean more = rows.size() > limit;
        var page = rows.subList(0, Math.min(limit, rows.size()));
        String next = null;
        if (more) { var last = page.get(page.size()-1); next = Base64.getUrlEncoder().withoutPadding().encodeToString(
            ("1\n"+binding+"\nk:"+Base64.getUrlEncoder().withoutPadding().encodeToString(last.key().getBytes(StandardCharsets.UTF_8))+"\n"+last.item().diaryId()).getBytes(StandardCharsets.UTF_8)); }
        return new Page(page.stream().map(Row::item).toList(), next, more);
    }
    public Detail detail(long user, String id) {
        var rows = jdbc.query("select r.* from ("+ROWS+") r where r.diary_id=:id and r.deleted_at is null",
            new MapSqlParameterSource("user", user).addValue("id", uuid(id)), (rs, index) -> item(rs));
        if (rows.isEmpty()) throw new DiaryReadException(404, "DIARY_NOT_FOUND", "다이어리를 찾을 수 없어요.");
        return new Detail(rows.get(0));
    }
    private static UUID uuid(String value) {
        try { UUID id = UUID.fromString(value); if (!id.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException(); return id; }
        catch (IllegalArgumentException error) { throw new DiaryReadException(400, "INVALID_DIARY_ID", "다이어리 ID를 확인해 주세요."); }
    }
    private static Instant instant(ResultSet rs, String name) throws SQLException {
        Timestamp value = rs.getTimestamp(name); return value == null ? null : value.toInstant();
    }
    private Item item(ResultSet rs) throws SQLException {
        boolean owner = rs.getString("my_role").equals("OWNER");
        Instant deleted = instant(rs, "deleted_at"), expires = deleted == null ? null : deleted.plus(30, ChronoUnit.DAYS);
        return new Item(Long.toString(rs.getLong("version")), rs.getString("diary_id"), rs.getString("title"), rs.getString("cover_color").strip(), rs.getString("cover_style"),
            rs.getString("visibility"), rs.getString("my_role"), new Membership(rs.getBoolean("favorite")),
            new Permissions(owner && deleted == null, deleted == null, owner && deleted == null,
                owner && expires != null && time.now().isBefore(expires), owner && deleted != null),
            rs.getLong("page_count"), rs.getString("first_page_id"), instant(rs,"created_at"), instant(rs,"updated_at"), deleted, expires);
    }
    private static String fingerprint(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
    private record Row(Item item, String key) {}
}
