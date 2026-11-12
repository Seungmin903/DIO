package com.f106.DIO.auth.config;

import com.f106.DIO.auth.service.ExpiredLoginSessionCleanup;
import com.f106.DIO.auth.service.ExpiredVerificationCleanup;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.slf4j.LoggerFactory;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "dio.auth.session-cleanup.enabled", havingValue = "true", matchIfMissing = true)
public class LoginSessionCleanupSchedule {
    private final ExpiredLoginSessionCleanup cleanup;
    private final ExpiredVerificationCleanup verifications;
    public LoginSessionCleanupSchedule(ExpiredLoginSessionCleanup cleanup, ExpiredVerificationCleanup verifications) {
        this.cleanup = cleanup; this.verifications = verifications;
    }
    @Scheduled(fixedDelayString = "${dio.auth.session-cleanup.delay-ms:60000}",
        initialDelayString = "${dio.auth.session-cleanup.initial-delay-ms:300000}")
    public void run() {
        try {
            int count = cleanup.purgeExpired();
            if (count > 0) LoggerFactory.getLogger(getClass()).info("Expired login sessions removed: count={}", count);
        } catch (RuntimeException error) {
            LoggerFactory.getLogger(getClass()).error("Expired login session cleanup failed: errorType={}", error.getClass().getSimpleName());
        }
        try {
            int count = verifications.purgeExpired();
            if (count > 0) LoggerFactory.getLogger(getClass()).info("Expired verification rows removed: count={}", count);
        } catch (RuntimeException error) {
            LoggerFactory.getLogger(getClass()).error("Expired verification cleanup failed: errorType={}", error.getClass().getSimpleName());
        }
    }
}
