package com.f106.DIO.notification.event;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.f106.DIO.notification.event.InvitationNotificationSource.*;
import com.f106.DIO.notification.event.InvitationNotificationHandler.Outcome;

class InvitationNotificationHandlerTests {
    final InvitationNotificationRepository repository = mock(InvitationNotificationRepository.class);
    final InvitationNotificationSource source = mock(InvitationNotificationSource.class);
    final Instant now = Instant.parse("2026-10-29T00:00:00Z");
    final InvitationConfirmedEvent event = new InvitationConfirmedEvent(UUID.randomUUID(), 1, 2, now);
    InvitationNotificationHandler handler;
    @BeforeEach @SuppressWarnings("unchecked") void setup() {
        ObjectProvider<InvitationNotificationSource> sources = mock(ObjectProvider.class);
        ObjectProvider<Clock> clocks = mock(ObjectProvider.class);
        when(sources.getIfAvailable()).thenReturn(source);
        when(clocks.getIfAvailable(any())).thenReturn(Clock.fixed(now, ZoneOffset.UTC));
        when(repository.claim(any(), any())).thenReturn(true);
        when(repository.createNotification(any(), any())).thenReturn("9");
        handler = new InvitationNotificationHandler(repository, sources, clocks);
    }
    void snapshot(Kind kind, Eligibility eligibility, Instant expires) {
        when(source.findForNotification(eq(1L), eq(2L), any())).thenReturn(Optional.of(new Snapshot(1,2,3,UUID.randomUUID(),kind,eligibility,expires)));
    }
    @Test void pastEmailExpiryIsIgnoredAndReplayDoesNotCreateAgain() {
        snapshot(Kind.DIRECT,Eligibility.NOTIFIABLE,now.minusSeconds(1));
        assertThat(handler.handle(event).outcome()).isEqualTo(Outcome.CREATED);
        when(repository.byEvent(event)).thenReturn(Optional.of(new InvitationNotificationRepository.Receipt(2,1,now,Outcome.CREATED,"9")));
        assertThat(handler.handle(event).duplicate()).isTrue();
        verify(repository,times(1)).createNotification(any(),any());
    }
    @Test void emailSentinelTimezoneOffsetDoesNotInvalidateSnapshot() {
        snapshot(Kind.DIRECT,Eligibility.NOTIFIABLE,Instant.parse("+10000-01-01T07:59:59Z"));
        assertThat(handler.handle(event).outcome()).isEqualTo(Outcome.CREATED);
    }
    @Test void revokedEmailIsSkippedEvenWithPastExpiry() {
        snapshot(Kind.DIRECT,Eligibility.REVOKED,now.minusSeconds(1));
        assertThat(handler.handle(event).outcome()).isEqualTo(Outcome.SKIPPED_REVOKED);
        verify(repository,never()).createNotification(any(),any());
    }
    @Test void ineligibleEmailIsSkipped() {
        snapshot(Kind.DIRECT,Eligibility.INELIGIBLE,now.minusSeconds(1));
        assertThat(handler.handle(event).outcome()).isEqualTo(Outcome.SKIPPED_INELIGIBLE);
    }
    @Test void emailJudgedExpiredBySourceIsSkipped() {
        snapshot(Kind.DIRECT,Eligibility.EXPIRED,now.minusSeconds(1));
        assertThat(handler.handle(event).outcome()).isEqualTo(Outcome.SKIPPED_EXPIRED);
        verify(repository,never()).createNotification(any(),any());
        // 원본은 핸들러와 같은 시각으로 이메일 만료를 판정한다.
        verify(source).findForNotification(1,2,now);
    }
    @Test void expiredLinkStillUsesExpiryBoundary() {
        snapshot(Kind.LINK,Eligibility.NOTIFIABLE,now);
        assertThat(handler.handle(event).outcome()).isEqualTo(Outcome.SKIPPED_EXPIRED);
    }
    @Test void nanosecondEventIsRejectedBeforeDatabaseMutation() {
        assertThatThrownBy(()->handler.handle(new InvitationConfirmedEvent(event.eventId(),1,2,now.plusNanos(1)))).isInstanceOf(InvitationEventException.class);
        verifyNoInteractions(repository,source);
    }
}
