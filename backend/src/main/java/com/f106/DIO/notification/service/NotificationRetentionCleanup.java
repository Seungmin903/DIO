package com.f106.DIO.notification.service;

import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import com.f106.DIO.notification.repository.NotificationRepository;

/** Permanently removes notifications seven days after a user deletes them. */
@Component
@EnableScheduling
@ConditionalOnProperty(name="dio.notification.retention.enabled",havingValue="true",matchIfMissing=true)
public class NotificationRetentionCleanup {
    private final NotificationRepository notifications;
    private final Clock clock;
    public NotificationRetentionCleanup(NotificationRepository notifications, ObjectProvider<Clock> clocks) {
        this.notifications=notifications; this.clock=clocks.getIfAvailable(Clock::systemUTC);
    }
    @Scheduled(fixedDelayString="${dio.notification.retention.delay-ms:3600000}",initialDelayString="${dio.notification.retention.initial-delay-ms:900000}")
    public void clean() {
        notifications.purgeDeletedBefore(clock.instant().minus(Duration.ofDays(7)),100);
    }
}
