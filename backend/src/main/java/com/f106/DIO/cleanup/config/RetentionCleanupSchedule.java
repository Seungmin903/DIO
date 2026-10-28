package com.f106.DIO.cleanup.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import com.f106.DIO.diary.service.ExpiredDiaryCleanup;
import com.f106.DIO.media.service.ExpiredMediaCleanup;

/** 보존 기간이 끝난 다이어리와 미디어를 일정한 작은 배치로 정리한다. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "dio.retention-cleanup.enabled", havingValue = "true", matchIfMissing = true)
public class RetentionCleanupSchedule {
	private static final Logger log = LoggerFactory.getLogger(RetentionCleanupSchedule.class);
	private final ExpiredDiaryCleanup diaries;
	private final ExpiredMediaCleanup media;

	public RetentionCleanupSchedule(ExpiredDiaryCleanup diaries, ExpiredMediaCleanup media) {
		this.diaries = diaries;
		this.media = media;
	}

	@Scheduled(fixedDelayString = "${dio.retention-cleanup.delay-ms:3600000}",
		initialDelayString = "${dio.retention-cleanup.initial-delay-ms:900000}")
	public void run() {
		try {
			int count = diaries.purgeExpired();
			if (count > 0) log.info("Expired diaries purged: count={}", count);
		} catch (RuntimeException error) {
			log.error("Expired diary cleanup failed: errorType={}", error.getClass().getSimpleName(), error);
		}
		try {
			int count = media.purgeExpired();
			if (count > 0) log.info("Expired media purged: count={}", count);
		} catch (RuntimeException error) {
			log.error("Expired media cleanup failed: errorType={}", error.getClass().getSimpleName(), error);
		}
	}
}
