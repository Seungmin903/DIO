package com.f106.DIO.diary.trash;

import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import com.f106.DIO.diary.dto.*;
import com.f106.DIO.diary.detail.*;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;

@Service
public class DiaryTrashService {
    private final JdbcTemplate jdbc;
    private final DiaryRequestIdentity identity;
    private final DiaryDetailRepository diaries;
    private final DiaryMembershipAccess memberships;
    private final Duration retention;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();
    public record Cursor(int v, String q, String scope, String deletedAt, String id) {}

    @Autowired
    public DiaryTrashService(JdbcTemplate jdbc, DiaryRequestIdentity identity, DiaryDetailRepository diaries, DiaryMembershipAccess memberships,
        @Value("${dio.diary.trash.retention-days:30}") int days) {
        this(jdbc, identity, diaries, memberships, days, Clock.systemUTC());
    }
    public DiaryTrashService(JdbcTemplate jdbc, DiaryRequestIdentity identity, DiaryDetailRepository diaries, DiaryMembershipAccess memberships, int days, Clock clock) {
        if (days < 1 || days > 36500) throw new IllegalArgumentException("Invalid diary retention days");
        this.jdbc = jdbc; this.identity = identity; this.diaries = diaries; this.memberships = memberships; this.retention = Duration.ofDays(days); this.clock = clock;
    }
    private DiaryDetailException invalid() { return new DiaryDetailException(HttpStatus.BAD_REQUEST, "INVALID_DIARY_TRASH_QUERY", "휴지통 조회 조건이나 커서를 확인해 주세요."); }
    private long authenticate() {
        long user = identity.requireUserId(DiaryDetailException::unauthorized);
        if (!diaries.lockActiveUser(user)) throw DiaryDetailException.unauthorized();
        return user;
    }
    private DiaryTrashResponse.Item item(ResultSet rs, Instant now) throws SQLException {
        Timestamp deleted = rs.getTimestamp("deleted_at");
        Instant deletedAt = deleted == null ? null : deleted.toInstant();
        Instant purgeAt = deletedAt == null ? null : deletedAt.plus(retention);
        return new DiaryTrashResponse.Item(rs.getString("diary_id"), rs.getString("title"),
            rs.getString("cover_color"), rs.getString("cover_style"), rs.getString("visibility"),
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
            deletedAt, purgeAt, purgeAt != null && now.isBefore(purgeAt));
    }

    @Transactional
    public DiaryTrashResponse list(String query, Integer requestedLimit, String encoded) {
        long user = authenticate();
        String q = query == null ? "" : query.strip().toLowerCase(Locale.ROOT);
        int limit = requestedLimit == null ? 20 : requestedLimit;
        if (q.length() > 100 || limit < 1 || limit > 100) throw invalid();
        var args = new ArrayList<Object>(); args.add(user); args.add(user);
        String sql = "SELECT d.* FROM diaries d WHERE d.deleted_at IS NOT NULL AND d.owner_user_id=? "
            + "AND EXISTS (SELECT 1 FROM diary_members m WHERE m.diary_id=d.diary_id AND m.user_id=? AND m.role='OWNER' AND m.left_at IS NULL)";
        if (!q.isEmpty()) {
            sql += " AND LOWER(d.title) LIKE ? ESCAPE '!'";
            args.add("%" + q.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
        }
        if (encoded != null) {
            try {
                if (encoded.length() > 4096) throw invalid();
                var c = json.readValue(Base64.getUrlDecoder().decode(encoded), Cursor.class);
                if (c.v() != 1 || !q.equals(c.q()) || !("owner:" + user).equals(c.scope())) throw invalid();
                var deletedAt = Timestamp.from(Instant.parse(c.deletedAt()));
                var id = UUID.fromString(c.id());
                sql += " AND (d.deleted_at<? OR (d.deleted_at=? AND d.diary_id<?))";
                args.add(deletedAt); args.add(deletedAt); args.add(id);
            } catch (Exception e) { throw invalid(); }
        }
        sql += " ORDER BY d.deleted_at DESC, d.diary_id DESC LIMIT ?";
        args.add(limit + 1);
        Instant now = clock.instant();
        var rows = jdbc.query(sql, (rs, n) -> item(rs, now), args.toArray());
        boolean more = rows.size() > limit;
        var selected = rows.subList(0, Math.min(limit, rows.size()));
        String next = null;
        if (more) {
            var last = selected.get(selected.size() - 1);
            next = Base64.getUrlEncoder().withoutPadding().encodeToString(json.writeValueAsString(
                new Cursor(1, q, "owner:" + user, last.deletedAt().toString(), last.diaryId())).getBytes(StandardCharsets.UTF_8));
        }
        return new DiaryTrashResponse(selected, next, more);
    }

    @Transactional
    public DiaryResponse restore(UUID id) {
        long user = authenticate();
        var row = lockOwner(user, id);
        Instant updatedAt = row.updatedAt();
        if (row.deletedAt() != null) {
            Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
            if (!now.isBefore(row.deletedAt().plus(retention))) throw new DiaryDetailException(HttpStatus.GONE, "DIARY_RESTORE_EXPIRED", "복원 가능한 보관 기간이 지났어요.");
            jdbc.update("UPDATE diaries SET deleted_at=NULL, updated_at=? WHERE diary_id=?", Timestamp.from(now.isAfter(row.updatedAt()) ? now : row.updatedAt().plus(1, ChronoUnit.MICROS)), id);
            updatedAt = now.isAfter(row.updatedAt()) ? now : row.updatedAt().plus(1, ChronoUnit.MICROS);
        }
        return new DiaryResponse(new DiaryCreateResponse.DiaryData(row.id().toString(), row.title(),
            row.color(), row.style(), row.visibility(), row.createdAt(), updatedAt));
    }
    private DiaryDetailRepository.Snapshot lockOwner(long user, UUID id) {
        var row = diaries.lock(id, true).orElseThrow(DiaryDetailException::notFound);
        if (row.ownerUserId() == null || row.ownerUserId() != user
                || memberships.requireActiveRole(user, id, row.ownerUserId()) != DiaryMembershipAccess.Role.OWNER)
            throw DiaryDetailException.notFound();
        return row;
    }

    @Transactional
    public void trash(UUID id) {
        long user = authenticate();
        var row = lockOwner(user, id);
        if (row.deletedAt() != null) return; // 재요청은 보관 기한을 연장하지 않는다.
        Instant deleted = clock.instant().truncatedTo(ChronoUnit.MICROS);
        Instant updated = deleted.isAfter(row.updatedAt()) ? deleted : row.updatedAt().plus(1, ChronoUnit.MICROS);
        jdbc.update("UPDATE diaries SET deleted_at=?,updated_at=? WHERE diary_id=?", Timestamp.from(deleted), Timestamp.from(updated), id);
    }
}
