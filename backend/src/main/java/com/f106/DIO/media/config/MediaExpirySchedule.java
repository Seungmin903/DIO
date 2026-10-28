package com.f106.DIO.media.config;

import java.sql.PreparedStatement;
import java.sql.ResultSet;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import com.f106.DIO.media.service.ExpiredMediaCleanup;

/** PostgreSQL advisory lock으로 여러 서버 인스턴스의 미디어 정리 배치를 하나만 실행한다. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "dio.media.expiry-cleanup.enabled", havingValue = "true")
public class MediaExpirySchedule {
	private static final Logger log = LoggerFactory.getLogger(MediaExpirySchedule.class);
	private static final long ADVISORY_LOCK_KEY = 5_031_106_015L;
	private final ExpiredMediaCleanup cleanup;
	private final JdbcTemplate jdbc;
	private final boolean postgres;

	public MediaExpirySchedule(ExpiredMediaCleanup cleanup, JdbcTemplate jdbc) {
		this.cleanup = cleanup;
		this.jdbc = jdbc;
		this.postgres = Boolean.TRUE.equals(jdbc.execute((ConnectionCallback<Boolean>) connection ->
			"PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())));
	}

	@Scheduled(fixedDelayString = "${dio.media.expiry-cleanup.delay-ms:3600000}",
		initialDelayString = "${dio.media.expiry-cleanup.initial-delay-ms:900000}")
	public void run() {
		try {
			if (postgres) jdbc.execute((ConnectionCallback<Void>) connection -> {
				if (!tryLock(connection)) return null;
				try { logResult(cleanup.purgeExpired()); }
				finally { unlock(connection); }
				return null;
			});
			else logResult(cleanup.purgeExpired());
		} catch (RuntimeException error) {
			log.error("Expired media cleanup failed: errorType={}", error.getClass().getSimpleName(), error);
		}
	}

	private static boolean tryLock(java.sql.Connection connection) throws java.sql.SQLException {
		try (PreparedStatement statement = connection.prepareStatement("select pg_try_advisory_lock(?)")) {
			statement.setLong(1, ADVISORY_LOCK_KEY);
			try (ResultSet result = statement.executeQuery()) { return result.next() && result.getBoolean(1); }
		}
	}
	private static void unlock(java.sql.Connection connection) {
		try (PreparedStatement statement = connection.prepareStatement("select pg_advisory_unlock(?)")) {
			statement.setLong(1, ADVISORY_LOCK_KEY);
			statement.execute();
		} catch (java.sql.SQLException error) { log.warn("Media cleanup advisory lock release failed", error); }
	}
	private void logResult(ExpiredMediaCleanup.Result result) {
		if (result.deleted() > 0 || result.failed() > 0)
			log.info("Expired media cleanup: deleted={},failed={}", result.deleted(), result.failed());
	}
}
