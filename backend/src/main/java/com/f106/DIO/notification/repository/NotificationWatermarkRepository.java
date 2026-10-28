package com.f106.DIO.notification.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class NotificationWatermarkRepository {

	private final JdbcTemplate jdbc;
	private final String recipientLock;

	public NotificationWatermarkRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
		// PostgreSQL의 FK 검사 KEY SHARE와 충돌하지 않는 잠금. H2는 NO KEY UPDATE 구문이 없다.
		boolean postgres = Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>)
			connection -> "PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())));
		this.recipientLock = postgres ? " for no key update" : " for update";
	}

	/** 한 회원의 동시 발급을 직렬화해 활성 watermark 제한이 경합으로 우회되지 않게 한다. */
	public boolean lockRecipient(long userId) {
		return !jdbc.queryForList("select user_id from users where user_id = ?" + recipientLock, Long.class, userId).isEmpty();
	}

	/** 각 호출은 만료된 경계 하나를 잠그고 대상 행을 제한된 수만큼 제거한다. */
	@Transactional
	public int removeExpiredBatch(Instant now, int limit) {
		var ids = jdbc.queryForList("select watermark_id from notification_read_watermarks where expires_at <= ? "
			+ "order by expires_at, watermark_id limit 1 for update skip locked", UUID.class, Timestamp.from(now));
		if (ids.isEmpty()) return 0;
		UUID id = ids.get(0);
		int removed = jdbc.update("delete from notification_read_watermark_items where watermark_id = ? and notification_id in "
			+ "(select notification_id from notification_read_watermark_items where watermark_id = ? order by notification_id limit ?)", id, id, limit);
		int parent = jdbc.update("delete from notification_read_watermarks where watermark_id = ? and not exists "
			+ "(select 1 from notification_read_watermark_items where watermark_id = ?)", id, id);
		return removed + parent;
	}

	public long activeCount(long userId, Instant now) {
		return jdbc.queryForObject("select count(*) from notification_read_watermarks where user_id = ? and expires_at > ?", Long.class, userId, Timestamp.from(now));
	}

	public void create(UUID id, long userId, Instant now, Instant expiresAt) {
		jdbc.update("insert into notification_read_watermarks(watermark_id,user_id,created_at,expires_at) values (?,?,?,?)",
			id, userId, Timestamp.from(now), Timestamp.from(expiresAt));
		// 단일 INSERT SELECT의 가시성으로 대상 고정. 이후 커밋되는 낮은 ID·과거 생성 시각도 추가되지 않는다.
		jdbc.update("insert into notification_read_watermark_items(watermark_id,notification_id)"
			+ " select ?, notification_id from notifications where user_id = ? and deleted_at is null and read_at is null", id, userId);
	}

	public Optional<Watermark> lock(UUID id, long userId) {
		return jdbc.query("select expires_at,applied_at from notification_read_watermarks where watermark_id = ? and user_id = ? for update",
			(rs, row) -> new Watermark(rs.getTimestamp("expires_at").toInstant(),
				rs.getTimestamp("applied_at") == null ? null : rs.getTimestamp("applied_at").toInstant()), id, userId).stream().findFirst();
	}

	public void apply(UUID id, long userId, Instant now) {
		jdbc.update("update notification_read_watermarks set applied_at = ? where watermark_id = ? and user_id = ? and applied_at is null",
			Timestamp.from(now), id, userId);
		jdbc.update("update notifications set read_at = ? where user_id = ? and deleted_at is null and read_at is null"
			+ " and exists (select 1 from notification_read_watermark_items scope where scope.watermark_id = ?"
			+ " and scope.notification_id = notifications.notification_id)", Timestamp.from(now), userId, id);
		// 완료 표식과 읽음 갱신, 대상 제거는 같은 트랜잭션에서 확정된다.
		jdbc.update("delete from notification_read_watermark_items where watermark_id = ?", id);
	}

	public record Watermark(Instant expiresAt, Instant appliedAt) {}
}
