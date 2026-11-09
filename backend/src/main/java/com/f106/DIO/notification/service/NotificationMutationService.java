package com.f106.DIO.notification.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.notification.repository.NotificationWatermarkRepository;
import com.f106.DIO.notification.support.NotificationException;

/** 244 최종 계약 합의 전 검증용 정책: 회원별 전체 미읽음 스냅샷, 유효 기간 10분, 활성 최대 20개. */
@Service
@Transactional
public class NotificationMutationService {

	private static final Duration WATERMARK_TTL = Duration.ofMinutes(10);
	private static final int MAX_WATERMARKS = 20;
	private final NotificationWatermarkRepository watermarks;
	private final Clock clock;

	public NotificationMutationService(NotificationWatermarkRepository watermarks,
		ObjectProvider<Clock> clocks) {
		this.watermarks = watermarks;
		this.clock = clocks.getIfAvailable(Clock::systemUTC);
	}

	public PreparedRead prepareReadAll(long userId) {
		if (!watermarks.lockRecipient(userId)) {
			throw new NotificationException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "로그인이 필요해요.");
		}
		Instant now = now();
		if (watermarks.activeCount(userId, now) >= MAX_WATERMARKS) {
			throw new NotificationException(HttpStatus.TOO_MANY_REQUESTS, "READ_WATERMARK_LIMIT", "잠시 후 다시 시도해 주세요.");
		}
		UUID id = UUID.randomUUID();
		Instant expiresAt = now.plus(WATERMARK_TTL);
		watermarks.create(id, userId, now, expiresAt);
		return new PreparedRead(id, expiresAt);
	}

	public void readAll(long userId, UUID id) {
		var watermark = watermarks.lock(id, userId).orElseThrow(() -> new NotificationException(
			HttpStatus.BAD_REQUEST, "INVALID_READ_WATERMARK", "전체 읽음 요청을 다시 준비해 주세요."));
		Instant now = now();
		if (!now.isBefore(watermark.expiresAt())) {
			throw new NotificationException(HttpStatus.GONE, "READ_WATERMARK_EXPIRED", "전체 읽음 요청이 만료됐어요. 다시 준비해 주세요.");
		}
		// 이미 완료한 요청은 동일한 성공 응답. 알림이 새로 생겨도 다시 대상으로 삼지 않는다.
		if (watermark.appliedAt() == null) watermarks.apply(id, userId, now);
	}

	private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }

	public record PreparedRead(UUID readWatermark, Instant expiresAt) {}
}
