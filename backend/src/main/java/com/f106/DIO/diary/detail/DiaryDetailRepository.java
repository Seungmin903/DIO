package com.f106.DIO.diary.detail;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.f106.DIO.diary.dto.DiaryCreateResponse.DiaryData;

@Repository
public class DiaryDetailRepository {
	private final JdbcTemplate jdbc;
	private final String sharedLock;

	public DiaryDetailRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
		boolean postgres = Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>)
			connection -> "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())));
		this.sharedLock = postgres ? " for share" : " for update";
	}

	String sharedLock() { return sharedLock; }

	public boolean lockActiveUser(long userId) {
		return !jdbc.queryForList("select user_id from users where user_id = ? and status = 'ACTIVE' and deleted_at is null" + sharedLock,
			Long.class, userId).isEmpty();
	}

	/**
	 * Reads keep a shared lock while the authorized service snapshot is materialized.
	 * Together with user -> diary -> membership ordering, this serializes account
	 * deactivation, diary deletion and membership revocation with the permission check.
	 * PostgreSQL row locks can write tuple metadata and delay PATCH; do not remove
	 * them without replacing this consistency contract and its concurrency tests.
	 */
	public Optional<Snapshot> lock(UUID diaryId, boolean writing) {
		return jdbc.query("select diary_id,owner_user_id,title,cover_color,cover_style,visibility,created_at,updated_at,deleted_at"
			+ " from diaries where diary_id = ?" + (writing ? " for update" : sharedLock),
			(rs, row) -> new Snapshot(rs.getObject("diary_id", UUID.class), rs.getObject("owner_user_id", Long.class),
				rs.getString("title"), rs.getString("cover_color"), rs.getString("cover_style"), rs.getString("visibility"),
				rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
				rs.getTimestamp("deleted_at") == null ? null : rs.getTimestamp("deleted_at").toInstant()), diaryId).stream().findFirst();
	}

	public boolean update(Snapshot before, String title, String color, String style, Instant nextUpdatedAt) {
		return jdbc.update("update diaries set title = ?, cover_color = ?, cover_style = ?, updated_at = ?, version=version+1"
			+ " where diary_id = ? and deleted_at is null and updated_at = ? and version < 9223372036854775807", title, color, style, Timestamp.from(nextUpdatedAt),
			before.id(), Timestamp.from(before.updatedAt())) == 1;
	}

	public record Snapshot(UUID id, Long ownerUserId, String title, String color, String style, String visibility,
		Instant createdAt, Instant updatedAt, Instant deletedAt) {
		public DiaryData data() {
			return new DiaryData(id.toString(), title, color, style, visibility, createdAt, updatedAt);
		}
	}
}
