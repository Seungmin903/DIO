package com.f106.DIO.diary.trash;

import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
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
    @org.springframework.beans.factory.annotation.Autowired private com.f106.DIO.inventory.InventoryLimits inventory;
    private final JdbcTemplate jdbc;
    private final boolean postgres;
    private final DiaryRequestIdentity identity;
    private final DiaryDetailRepository diaries;
    private final DiaryMembershipAccess memberships;
    // Fixed product contract: restore is allowed only before deletedAt + 30 days.
    private static final Duration RETENTION = com.f106.DIO.diary.support.DiaryRetention.PERIOD;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();
    public record Cursor(int v, String q, String scope, String deletedAt, String id) {}

    @Autowired
    public DiaryTrashService(JdbcTemplate jdbc, DiaryRequestIdentity identity, DiaryDetailRepository diaries, DiaryMembershipAccess memberships) {
        this(jdbc, identity, diaries, memberships, Clock.systemUTC());
    }
    public DiaryTrashService(JdbcTemplate jdbc, DiaryRequestIdentity identity, DiaryDetailRepository diaries, DiaryMembershipAccess memberships, Clock clock) {
        this.postgres=Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>) c -> "PostgreSQL".equals(c.getMetaData().getDatabaseProductName())));
        this.jdbc = jdbc; this.identity = identity; this.diaries = diaries; this.memberships = memberships; this.clock = clock;
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
        Instant purgeAt = deletedAt == null ? null : deletedAt.plus(RETENTION);
        return new DiaryTrashResponse.Item(rs.getString("diary_id"), rs.getString("title"),
            rs.getString("cover_color"), rs.getString("cover_style"), rs.getString("visibility"),
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
            deletedAt, purgeAt, purgeAt != null && now.isBefore(purgeAt),Long.toString(rs.getLong("version")),true,
            com.f106.DIO.diary.support.DiaryTemplateConfig.readLenient(rs.getString("template_config_json"),rs.getString("diary_id")));
    }

    // PostgreSQL uses FOR SHARE: concurrent readers coexist while account deactivation waits.
    // Keep a normal transaction because PostgreSQL forbids row locks in a read-only transaction.
    @Transactional
    public DiaryTrashResponse list(String query, Integer requestedLimit, String encoded) {
        long user = authenticate();
        String q = query == null ? "" : query.strip();
        int limit = requestedLimit == null ? 20 : requestedLimit;
        if (q.length() > 100 || limit < 1 || limit > 100) throw invalid();
        if (!q.isEmpty()) {
            if (postgres && !Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from pg_catalog.pg_collation where collname='und-x-icu' and collnamespace='pg_catalog'::regnamespace and collprovider='i' and collisdeterministic)",Boolean.class)))
                throw new DiaryDetailException(HttpStatus.SERVICE_UNAVAILABLE,"DIARY_TRASH_SEARCH_UNAVAILABLE","휴지통 검색을 지금 사용할 수 없어요.");
            q=jdbc.queryForObject(postgres ? "SELECT LOWER(CAST(? AS text) COLLATE pg_catalog.\"und-x-icu\")" : "SELECT LOWER(CAST(? AS VARCHAR))",String.class,q);
            if (q.length()>100) throw invalid();
        }
        var args = new ArrayList<Object>(); args.add(user); args.add(user);
        String sql = "SELECT d.* FROM diaries d WHERE d.deleted_at IS NOT NULL AND d.owner_user_id=? "
            + "AND EXISTS (SELECT 1 FROM diary_members m WHERE m.diary_id=d.diary_id AND m.user_id=? AND m.role='OWNER' AND m.left_at IS NULL)";
        if (!q.isEmpty()) {
            sql += postgres ? " AND LOWER(d.title COLLATE pg_catalog.\"und-x-icu\") COLLATE pg_catalog.\"C\" LIKE ? ESCAPE '!'" : " AND LOWER(d.title) LIKE ? ESCAPE '!'";
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
        long user = identity.requireUserId(DiaryDetailException::unauthorized);
        var row = lockOwner(user, id);
        if(!diaries.lockActiveUser(user)) throw DiaryDetailException.unauthorized();
        Instant updatedAt = row.updatedAt();
        if (row.deletedAt() != null) {
            Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
            if (!now.isBefore(row.deletedAt().plus(RETENTION))) throw new DiaryDetailException(HttpStatus.GONE, "DIARY_RESTORE_EXPIRED", "복원 가능한 보관 기간이 지났어요.");
            long version=version(id);
            if(jdbc.update("UPDATE diaries SET deleted_at=NULL,updated_at=?,version=version+1 WHERE diary_id=? AND version=? AND deleted_at IS NOT NULL",Timestamp.from(now.isAfter(row.updatedAt())?now:row.updatedAt().plus(1,ChronoUnit.MICROS)),id,version)!=1) throw conflict();
            inventory.restoredDiary(id,inventory.shared(id));
            updatedAt = now.isAfter(row.updatedAt()) ? now : row.updatedAt().plus(1, ChronoUnit.MICROS);
        }
        return new DiaryResponse(new DiaryCreateResponse.DiaryData(row.id().toString(), row.title(),
            row.color(), row.style(), row.visibility(), row.createdAt(), updatedAt));
    }
    private DiaryDetailRepository.Snapshot lockOwner(long user, UUID id) {
        var row = diaries.lock(id, true).orElseThrow(DiaryDetailException::notFound);
        var role=memberships.requireActiveRole(user,id,row.ownerUserId());
        if(row.ownerUserId()!=null && row.ownerUserId()!=user && role==DiaryMembershipAccess.Role.EDITOR)
            throw new DiaryDetailException(HttpStatus.FORBIDDEN,"DIARY_OWNER_REQUIRED","소유자만 휴지통과 복원을 관리할 수 있어요.");
        if(row.ownerUserId()==null || row.ownerUserId()!=user || role!=DiaryMembershipAccess.Role.OWNER) throw DiaryDetailException.notFound();
        return row;
    }

    private DiaryDetailException conflict() {return new DiaryDetailException(HttpStatus.CONFLICT,"DIARY_METADATA_CONFLICT","최신 상태를 확인해 주세요.");}
    private long version(UUID id) {
        long version=jdbc.queryForObject("select version from diaries where diary_id=?",Long.class,id);
        if(version==Long.MAX_VALUE) throw new DiaryDetailException(HttpStatus.CONFLICT,"VERSION_EXHAUSTED","다이어리 버전을 더 갱신할 수 없어요.");
        return version;
    }
    @Transactional
    public void trash(UUID id) {
        long user = identity.requireUserId(DiaryDetailException::unauthorized);
        var row = lockOwner(user, id);
        if(!diaries.lockActiveUser(user)) throw DiaryDetailException.unauthorized();
        if (row.deletedAt() != null) return; // 재요청은 보관 기한을 연장하지 않는다.
        Instant deleted = clock.instant().truncatedTo(ChronoUnit.MICROS);
        Instant updated = deleted.isAfter(row.updatedAt()) ? deleted : row.updatedAt().plus(1, ChronoUnit.MICROS);
        long version=version(id);
        if(jdbc.update("UPDATE diaries SET deleted_at=?,updated_at=?,version=version+1 WHERE diary_id=? AND version=? AND deleted_at IS NULL",Timestamp.from(deleted),Timestamp.from(updated),id,version)!=1) throw conflict();
    }
}
