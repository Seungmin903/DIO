package com.f106.DIO.media.service;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.function.LongSupplier;
import com.f106.DIO.media.support.MediaRequestException;

/** Per-instance, bounded negative cache. Stores no image bytes or authentication results. */
final class MediaThumbnailFailures {
	private final LinkedHashMap<String, Long> failures = new LinkedHashMap<>();
	private final long ttlNanos;
	private final int limit;
	private final LongSupplier clock;
	MediaThumbnailFailures() { this(Duration.ofMinutes(2), 1024, System::nanoTime); }
	MediaThumbnailFailures(Duration ttl, int limit, LongSupplier clock) {
		if (ttl.isNegative() || ttl.isZero() || limit < 1) throw new IllegalArgumentException("Invalid failure cache bounds");
		this.ttlNanos = ttl.toNanos(); this.limit = limit; this.clock = clock;
	}
	synchronized void check(String key) {
		Long expiresAt = failures.get(key);
		if (expiresAt == null) return;
		if (clock.getAsLong() - expiresAt < 0) throw MediaRequestException.invalidFile();
		failures.remove(key);
	}
	synchronized void remember(String key) {
		long now = clock.getAsLong();
		failures.entrySet().removeIf(entry -> now - entry.getValue() >= 0);
		failures.remove(key);
		failures.put(key, now + ttlNanos);
		if (failures.size() > limit) failures.remove(failures.keySet().iterator().next());
	}
}
