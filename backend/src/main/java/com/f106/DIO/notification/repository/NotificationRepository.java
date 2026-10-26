package com.f106.DIO.notification.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.f106.DIO.notification.dto.NotificationData;
import com.f106.DIO.notification.service.NotificationCursor;

/** Flyway V1의 notifications를 재사용한다. payload_json은 민감 참조가 포함될 수 있어 그대로 노출하지 않는다. */
@Repository
public class NotificationRepository {

	private static final String COLUMNS = "notification_id, notification_type, actor_user_id, diary_id, page_id, read_at, created_at";
	private final JdbcTemplate jdbc;

	public NotificationRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

	public List<NotificationData> list(long userId, NotificationCursor cursor, int limit) {
		String sql = "select " + COLUMNS + " from notifications where user_id = ? and deleted_at is null";
		if (cursor == null) {
			return jdbc.query(sql + " order by created_at desc, notification_id desc limit ?", this::map, userId, limit);
		}
		return jdbc.query(sql + " and (created_at < ? or (created_at = ? and notification_id < ?))"
			+ " order by created_at desc, notification_id desc limit ?", this::map,
			userId, Timestamp.from(cursor.createdAt()), Timestamp.from(cursor.createdAt()), cursor.notificationId(), limit);
	}

	public Optional<NotificationData> find(long userId, long id) {
		return jdbc.query("select " + COLUMNS + " from notifications where user_id = ? and notification_id = ? and deleted_at is null",
			this::map, userId, id).stream().findFirst();
	}

	public long unreadCount(long userId) {
		return jdbc.queryForObject("select count(*) from notifications where user_id = ? and deleted_at is null and read_at is null",
			Long.class, userId);
	}

	/** 비교 후 저장 대신 조건부 UPDATE를 사용해 동시 요청에도 최초 읽은 시각을 보존한다. */
	public void markRead(long userId, long id, Instant at) {
		jdbc.update("update notifications set read_at = ? where user_id = ? and notification_id = ? and deleted_at is null and read_at is null",
			Timestamp.from(at), userId, id);
	}

	private NotificationData map(ResultSet rs, int row) throws SQLException {
		Timestamp readAt = rs.getTimestamp("read_at");
		return new NotificationData(rs.getString("notification_id"), rs.getString("notification_type"),
			rs.getString("actor_user_id"), rs.getObject("diary_id", UUID.class), rs.getObject("page_id", UUID.class),
			readAt == null ? null : readAt.toInstant(), rs.getTimestamp("created_at").toInstant());
	}
}
