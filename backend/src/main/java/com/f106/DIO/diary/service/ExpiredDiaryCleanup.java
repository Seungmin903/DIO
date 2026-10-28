package com.f106.DIO.diary.service;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.f106.DIO.diary.repository.DiaryRepository;

/** 휴지통으로 이동한 다이어리를 보존 기간이 지난 뒤 물리 삭제한다. */
@Service
public class ExpiredDiaryCleanup {
	private final DiaryRepository diaries;
	private final Duration retention;
	private final int batchSize;

	public ExpiredDiaryCleanup(DiaryRepository diaries,
		@Value("${dio.retention-cleanup.diary-retention:P30D}") Duration retention,
		@Value("${dio.retention-cleanup.batch-size:100}") int batchSize) {
		this.diaries = diaries;
		this.retention = retention;
		this.batchSize = batchSize;
	}

	public int purgeExpired() {
		return purgeExpiredAt(Instant.now());
	}

	int purgeExpiredAt(Instant now) {
		Instant cutoff = now.minus(retention);
		int deleted = 0;
		for (UUID diaryId : diaries.findExpiredDeletedIds(cutoff, PageRequest.of(0, batchSize))) {
			deleted += diaries.deleteExpiredByDiaryId(diaryId, cutoff);
		}
		return deleted;
	}
}
