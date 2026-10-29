package com.f106.DIO.notification.event;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.notification.event.InvitationNotificationRepository.Receipt;
import com.f106.DIO.notification.event.InvitationNotificationSource.Snapshot;

	/** 공유 모듈이 발행한 초대 확정 이벤트를 알림 처리로 연결한다. */
@Service
public class InvitationNotificationHandler {

	private final InvitationNotificationRepository repository;
	private final ObjectProvider<InvitationNotificationSource> sources;
	private final Clock clock;

	public InvitationNotificationHandler(InvitationNotificationRepository repository, ObjectProvider<InvitationNotificationSource> sources,
		ObjectProvider<Clock> clocks) {
		this.repository = repository;
		this.sources = sources;
		this.clock = clocks.getIfAvailable(Clock::systemUTC);
	}

	/**
	 * 공유 초대 확정 트랜잭션에서 발행된 애플리케이션 이벤트를 동기 처리한다.
	 * 처리 실패는 예외로 전파해 발행자/상위 재시도 경계가 관찰할 수 있게 한다.
	 */
	@EventListener
	@Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
	public void onInvitationConfirmed(InvitationConfirmedEvent event) {
		handle(event);
	}

	@Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
	public Result handle(InvitationConfirmedEvent event) {
		validateEvent(event);
		var existing = repository.byEvent(event);
		if (existing.isPresent()) return replay(event, existing.get(), true);
		existing = repository.byInvitation(event);
		if (existing.isPresent()) return replay(event, existing.get(), false);

		var source = sources.getIfAvailable();
		if (source == null) throw new InvitationEventException("공유 초대 조회 연결이 아직 준비되지 않았습니다.", true);
		Snapshot snapshot = source.findForNotification(event.inviteId(), event.recipientUserId())
			.orElseThrow(() -> new InvitationEventException("현재 초대 상태를 확인하지 못했습니다.", true));
		validateSnapshot(event, snapshot);
		Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		if (!repository.claim(event, now)) {
			// 동시 전달의 승자가 커밋한 이력을 읽는다. 읽기 커밋 격리를 전제로 하며 DB 일시 오류는 호출자가 재시도한다.
			return repository.byEvent(event).map(receipt -> replay(event, receipt, true))
				.orElseGet(() -> repository.byInvitation(event).map(receipt -> replay(event, receipt, false))
					.orElseThrow(() -> new InvitationEventException("처리 이력을 다시 확인해야 합니다.", true)));
		}
		Outcome outcome = outcome(snapshot, now);
		String notificationId = outcome == Outcome.CREATED ? repository.createNotification(event, snapshot) : null;
		repository.finish(event, outcome, notificationId);
		return new Result(false, outcome, notificationId);
	}

	private Result replay(InvitationConfirmedEvent event, Receipt receipt, boolean sameEvent) {
		if (receipt.recipientUserId() != event.recipientUserId() || receipt.inviteId() != event.inviteId() || (sameEvent && !receipt.occurredAt().equals(event.occurredAt()))) {
			throw new InvitationEventException("같은 이벤트 ID의 내용이 달라졌습니다.", false);
		}
		if (receipt.outcome() == Outcome.PROCESSING) throw new InvitationEventException("이벤트 처리가 아직 완료되지 않았습니다.", true);
		return new Result(true, receipt.outcome(), receipt.notificationId());
	}

	private Outcome outcome(Snapshot snapshot, Instant now) {
		if (snapshot.eligibility() == InvitationNotificationSource.Eligibility.REVOKED) return Outcome.SKIPPED_REVOKED;
		// 이메일 초대는 무기한이다. 레거시 expires_at이나 DB/JVM 시간대와 무관하게 상태를 따른다.
		if (snapshot.kind() != InvitationNotificationSource.Kind.DIRECT
			&& (snapshot.eligibility() == InvitationNotificationSource.Eligibility.EXPIRED || !now.isBefore(snapshot.expiresAt()))) return Outcome.SKIPPED_EXPIRED;
		if (snapshot.kind() != InvitationNotificationSource.Kind.DIRECT
			|| snapshot.eligibility() != InvitationNotificationSource.Eligibility.NOTIFIABLE) return Outcome.SKIPPED_INELIGIBLE;
		return Outcome.CREATED;
	}

	private void validateEvent(InvitationConfirmedEvent event) {
		if (event == null || event.eventId() == null || event.inviteId() <= 0 || event.recipientUserId() <= 0
			|| !validTime(event.occurredAt())) throw new InvitationEventException("초대 이벤트 형식이 잘못됐습니다.", false);
	}

	private void validateSnapshot(InvitationConfirmedEvent event, Snapshot snapshot) {
		if (snapshot.inviteId() != event.inviteId() || snapshot.recipientUserId() != event.recipientUserId()
			|| snapshot.inviterUserId() <= 0 || snapshot.diaryId() == null || snapshot.kind() == null
			|| snapshot.eligibility() == null || (snapshot.kind() != InvitationNotificationSource.Kind.DIRECT && !validTime(snapshot.expiresAt()))) {
			throw new InvitationEventException("초대 조회 결과가 이벤트와 맞지 않습니다.", false);
		}
	}

	private boolean validTime(Instant time) {
		return time != null && time.equals(time.truncatedTo(ChronoUnit.MICROS))
			&& !time.isBefore(Instant.parse("0001-01-01T00:00:00Z")) && !time.isAfter(Instant.parse("9999-12-31T23:59:59Z"));
	}

	public enum Outcome { PROCESSING, CREATED, SKIPPED_REVOKED, SKIPPED_EXPIRED, SKIPPED_INELIGIBLE }
	public record Result(boolean duplicate, Outcome outcome, String notificationId) {}
}
