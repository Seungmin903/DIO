package com.f106.DIO.auth.login;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.slf4j.LoggerFactory;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "dio.auth.session-cleanup.enabled", havingValue = "true", matchIfMissing = true)
class LoginSessionCleanupSchedule {
    private final ExpiredLoginSessionCleanup cleanup;
    LoginSessionCleanupSchedule(ExpiredLoginSessionCleanup cleanup) { this.cleanup = cleanup; }
    @Scheduled(fixedDelayString = "${dio.auth.session-cleanup.delay-ms:60000}",
        initialDelayString = "${dio.auth.session-cleanup.initial-delay-ms:300000}")
    public void run() {
        try {
            int count = cleanup.purgeExpired();
            if (count > 0) LoggerFactory.getLogger(getClass()).info("Expired login sessions removed: count={}", count);
        } catch (RuntimeException error) {
            LoggerFactory.getLogger(getClass()).error("Expired login session cleanup failed: errorType={}", error.getClass().getSimpleName());
        }
    }
}
