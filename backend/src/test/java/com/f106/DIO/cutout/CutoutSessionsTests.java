package com.f106.DIO.cutout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import com.f106.DIO.cutout.service.CutoutSessions;
import com.f106.DIO.cutout.support.CutoutException;

class CutoutSessionsTests {
	private final MutableClock clock = new MutableClock(Instant.parse("2026-11-01T00:00:00Z"));
	private final CutoutSessions sessions = new CutoutSessions(Duration.ofMinutes(30), 2, 10, clock);

	@Test
	void ownerCanUseSessionAndOthersSeeExpired() {
		var session = sessions.open(1L, "img-1");

		assertThat(sessions.use(session.cutoutId(), 1L).imageId()).isEqualTo("img-1");
		assertThatThrownBy(() -> sessions.use(session.cutoutId(), 2L)).isInstanceOf(CutoutException.class)
			.extracting(error -> ((CutoutException) error).code()).isEqualTo("CUTOUT_EXPIRED");
	}

	@Test
	void sessionExpiresAfterIdleTtlButUseExtendsIt() {
		var session = sessions.open(1L, "img-1");
		clock.advance(Duration.ofMinutes(20));
		sessions.use(session.cutoutId(), 1L);
		clock.advance(Duration.ofMinutes(20));

		assertThat(sessions.use(session.cutoutId(), 1L).imageId()).isEqualTo("img-1");

		clock.advance(Duration.ofMinutes(31));
		assertThatThrownBy(() -> sessions.use(session.cutoutId(), 1L)).isInstanceOf(CutoutException.class);
	}

	@Test
	void tooManySessionsForOneUserDropsTheOldest() {
		var first = sessions.open(1L, "img-1");
		clock.advance(Duration.ofSeconds(1));
		var second = sessions.open(1L, "img-2");
		clock.advance(Duration.ofSeconds(1));
		sessions.open(1L, "img-3");

		assertThatThrownBy(() -> sessions.use(first.cutoutId(), 1L)).isInstanceOf(CutoutException.class);
		assertThat(sessions.use(second.cutoutId(), 1L).imageId()).isEqualTo("img-2");
	}

	@Test
	void closeOnlyRemovesOwnSession() {
		var session = sessions.open(1L, "img-1");
		sessions.close(session.cutoutId(), 2L);
		assertThat(sessions.use(session.cutoutId(), 1L)).isNotNull();

		sessions.close(session.cutoutId(), 1L);
		assertThatThrownBy(() -> sessions.use(session.cutoutId(), 1L)).isInstanceOf(CutoutException.class);
	}

	private static final class MutableClock extends Clock {
		private Instant now;
		MutableClock(Instant now) { this.now = now; }
		void advance(Duration duration) { now = now.plus(duration); }
		@Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
		@Override public Clock withZone(java.time.ZoneId zone) { return this; }
		@Override public Instant instant() { return now; }
	}
}
