package com.f106.DIO.notification.service;

import java.time.Clock;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    // 배치마다 따로 커밋한다. 한 번 실행에 최대 10,000건(1시간 주기면 하루 240,000건)을 지운다.
    static final int BATCH_SIZE=500, MAX_BATCHES=20;
    private static final Logger log=LoggerFactory.getLogger(NotificationRetentionCleanup.class);
    private final NotificationRepository notifications;
    private final Clock clock;
    public NotificationRetentionCleanup(NotificationRepository notifications, ObjectProvider<Clock> clocks) {
        this.notifications=notifications; this.clock=clocks.getIfAvailable(Clock::systemUTC);
    }
    @Scheduled(fixedDelayString="${dio.notification.retention.delay-ms:3600000}",initialDelayString="${dio.notification.retention.initial-delay-ms:900000}")
    public void clean() {purgeExpired();}
    int purgeExpired() {
        var cutoff=clock.instant().minus(Duration.ofDays(7));
        int total=0;
        for(int batch=0;batch<MAX_BATCHES;batch++){
            int deleted=notifications.purgeDeletedBefore(cutoff,BATCH_SIZE);
            total+=deleted;
            if(deleted<BATCH_SIZE)break;
        }
        if(total>0)log.info("Purged {} notifications past retention",total);
        return total;
    }
}
