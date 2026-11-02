package com.f106.DIO.notification.event;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import com.f106.DIO.notification.event.InvitationNotificationSource.Snapshot;

@Repository
public class InvitationNotificationRepository {

	private final JdbcTemplate jdbc;

	public InvitationNotificationRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

	public Optional<Receipt> byEvent(InvitationConfirmedEvent event) {
		return find("event_id = ?", event.eventId());
	}

	public Optional<Receipt> byInvitation(InvitationConfirmedEvent event) {
		return find("invite_id = ? and recipient_user_id = ?", event.inviteId(), event.recipientUserId());
	}

	private Optional<Receipt> find(String condition, Object... arguments) {
		return jdbc.query("select recipient_user_id,invite_id,event_occurred_at,outcome,notification_id from invitation_notification_receipts where " + condition,
			(rs, row) -> new Receipt(rs.getLong("recipient_user_id"), rs.getLong("invite_id"), rs.getTimestamp("event_occurred_at").toInstant(),
				InvitationNotificationHandler.Outcome.valueOf(rs.getString("outcome")), rs.getString("notification_id")), arguments).stream().findFirst();
	}

	/** 사전 조회만으로 중복을 판단하지 않고 DB 유일 제약으로 최종 점유한다. PostgreSQL/H2 PG 모드 공통 구문. */
	public boolean claim(InvitationConfirmedEvent event, Instant now) {
		return jdbc.update("insert into invitation_notification_receipts(event_id,recipient_user_id,invite_id,event_occurred_at,outcome,processed_at)"
			+ " values (?,?,?,?,'PROCESSING',?) on conflict do nothing", event.eventId(), event.recipientUserId(), event.inviteId(),
			Timestamp.from(event.occurredAt()), Timestamp.from(now)) == 1;
	}

	public String createNotification(InvitationConfirmedEvent event, Snapshot snapshot) {
		var key = new GeneratedKeyHolder();
		// 두 값 모두 검증된 숫자 ID/UUID이므로 사용자 문자열이나 초대 토큰이 JSON에 들어가지 않는다.
		String payload = "{\"inviteId\":\"" + event.inviteId() + "\",\"sourceEventId\":\"" + event.eventId() + "\"}";
		jdbc.update(connection -> {
			var statement = connection.prepareStatement("insert into notifications(user_id,actor_user_id,diary_id,notification_type,payload_json,created_at)"
				+ " values (?,?,?,'DIARY_INVITE',cast(? as jsonb),?)", new String[]{"notification_id"});
			statement.setLong(1, event.recipientUserId());
			statement.setLong(2, snapshot.inviterUserId());
			statement.setObject(3, snapshot.diaryId());
			statement.setString(4, payload);
			statement.setTimestamp(5, Timestamp.from(event.occurredAt()));
			return statement;
		}, key);
		return key.getKey().toString();
	}

	/** 알림과 같은 트랜잭션에서 저장한다. 발송 및 기기별 전달은 별도 작업이다. */
	public void createPushOutbox(InvitationConfirmedEvent event, String notificationId, Instant now, long ttlSeconds, String environment, String appId) {
		int inserted = jdbc.update("insert into push_outbox(outbox_id,event_key,notification_id,recipient_user_id,event_type,reference_id,status,created_at,expires_at,environment,app_id) values (?,?,?,?,?,?,'PENDING',?,?,?,?)",
			java.util.UUID.randomUUID(), "invitation:" + event.inviteId() + ":" + event.recipientUserId(), Long.parseLong(notificationId), event.recipientUserId(),
			"DIARY_INVITE", Long.toString(event.inviteId()), Timestamp.from(now), Timestamp.from(now.plusSeconds(ttlSeconds)), environment, appId);
		if (inserted != 1) throw new IllegalStateException("푸시 대기열 저장에 실패했습니다.");
	}

	public void finish(InvitationConfirmedEvent event, InvitationNotificationHandler.Outcome outcome, String notificationId) {
		int updated = jdbc.update("update invitation_notification_receipts set outcome = ?, notification_id = ? where event_id = ? and recipient_user_id = ?",
			outcome.name(), notificationId == null ? null : Long.parseLong(notificationId), event.eventId(), event.recipientUserId());
		if (updated != 1) throw new InvitationEventException("이벤트 처리 이력을 저장하지 못했습니다.", true);
	}

	public record Receipt(long recipientUserId, long inviteId, Instant occurredAt, InvitationNotificationHandler.Outcome outcome, String notificationId) {}
}
