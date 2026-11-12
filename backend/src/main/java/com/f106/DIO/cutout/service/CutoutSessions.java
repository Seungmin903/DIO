package com.f106.DIO.cutout.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import com.f106.DIO.cutout.support.CutoutException;

/**
 * cutoutId → (사용자, AI 서버 imageId). AI 서버도 사진 임베딩을 메모리에만 두므로 같은 수명(마지막 사용 후 TTL)으로 맞춘다.
 * 서버를 재시작하면 사라지고 앱은 사진을 다시 올린다. 백엔드를 여러 대로 늘리면 공유 저장소로 옮겨야 한다.
 */
@Component
public class CutoutSessions {
	private final Map<UUID, Session> sessions = new ConcurrentHashMap<>();
	private final Duration ttl;
	private final int maxPerUser;
	private final int maxTotal;
	private final Clock clock;

	@Autowired
	public CutoutSessions(@Value("${dio.cutout.session-ttl:PT30M}") Duration ttl,
			@Value("${dio.cutout.max-sessions-per-user:3}") int maxPerUser, @Value("${dio.cutout.max-sessions:500}") int maxTotal) {
		this(ttl, maxPerUser, maxTotal, Clock.systemUTC());
	}
	public CutoutSessions(Duration ttl, int maxPerUser, int maxTotal, Clock clock) {
		if (ttl.isNegative() || ttl.isZero() || maxPerUser < 1 || maxTotal < maxPerUser) throw new IllegalArgumentException("Invalid cutout session limits");
		this.ttl = ttl; this.maxPerUser = maxPerUser; this.maxTotal = maxTotal; this.clock = clock;
	}

	/** 새 세션을 만든다. 같은 사용자의 세션이 많으면 가장 오래 안 쓴 것부터 버린다. */
	public synchronized Session open(Long userId, String imageId) {
		Instant now = clock.instant();
		sessions.values().removeIf(session -> expired(session, now));
		while (sessions.values().stream().filter(session -> session.userId().equals(userId)).count() >= maxPerUser) evictOldest(userId);
		while (sessions.size() >= maxTotal) evictOldest(null);
		Session session = new Session(UUID.randomUUID(), userId, imageId, now);
		sessions.put(session.cutoutId(), session);
		return session;
	}

	/** 본인 세션만 돌려준다. 없거나 다른 사용자 것이거나 만료됐으면 모두 같은 '만료' 오류. */
	public Session use(UUID cutoutId, Long userId) {
		Instant now = clock.instant();
		Session found = sessions.get(cutoutId);
		if (found == null || !found.userId().equals(userId)) throw CutoutException.expired();
		if (expired(found, now)) { sessions.remove(cutoutId, found); throw CutoutException.expired(); }
		Session touched = found.touch(now);
		sessions.replace(cutoutId, found, touched);
		return touched;
	}

	public void close(UUID cutoutId, Long userId) {
		Session found = sessions.get(cutoutId);
		if (found != null && found.userId().equals(userId)) sessions.remove(cutoutId, found);
	}

	public Instant expiresAt(Session session) { return session.usedAt().plus(ttl); }

	private boolean expired(Session session, Instant now) { return !session.usedAt().plus(ttl).isAfter(now); }

	private void evictOldest(Long userId) {
		sessions.values().stream().filter(session -> userId == null || session.userId().equals(userId))
			.min(Comparator.comparing(Session::usedAt)).ifPresent(session -> sessions.remove(session.cutoutId(), session));
	}

	public record Session(UUID cutoutId, Long userId, String imageId, Instant usedAt) {
		Session touch(Instant now) { return new Session(cutoutId, userId, imageId, now); }
	}
}
