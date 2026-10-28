package com.f106.DIO.diary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import com.f106.DIO.diary.repository.DiaryRepository;

class ExpiredDiaryCleanupTests {
	private final DiaryRepository diaries = mock(DiaryRepository.class);
	private final ExpiredDiaryCleanup cleanup = new ExpiredDiaryCleanup(diaries, Duration.ofDays(30), 100);

	@Test
	void removesOnlyDiariesWhoseSoftDeleteRetentionHasElapsed() {
		Instant now = Instant.parse("2026-10-28T00:00:00Z");
		Instant cutoff = now.minus(Duration.ofDays(30));
		UUID first = UUID.randomUUID();
		UUID second = UUID.randomUUID();
		when(diaries.findExpiredDeletedIds(eq(cutoff), any(Pageable.class))).thenReturn(List.of(first, second));
		when(diaries.deleteExpiredByDiaryId(first, cutoff)).thenReturn(1);
		when(diaries.deleteExpiredByDiaryId(second, cutoff)).thenReturn(1);

		assertThat(cleanup.purgeExpiredAt(now)).isEqualTo(2);

		verify(diaries).deleteExpiredByDiaryId(first, cutoff);
		verify(diaries).deleteExpiredByDiaryId(second, cutoff);
	}
}
