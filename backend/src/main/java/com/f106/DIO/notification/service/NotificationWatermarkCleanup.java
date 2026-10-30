package com.f106.DIO.notification.service;

import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.stereotype.Component;
import com.f106.DIO.notification.repository.NotificationWatermarkRepository;

@Component
@EnableScheduling
@ConditionalOnProperty(name = "dio.notification.watermark-cleanup.enabled", havingValue = "true", matchIfMissing = true)
public class NotificationWatermarkCleanup {
    private static final int BATCH_SIZE = 500;
    private static final int MAX_BATCHES_PER_RUN = 10;
    private final NotificationWatermarkRepository repository;

    public NotificationWatermarkCleanup(NotificationWatermarkRepository repository) {
        this.repository = repository;
    }

    @Scheduled(fixedDelayString = "${dio.notification.watermark-cleanup.delay-ms:60000}", initialDelayString = "${dio.notification.watermark-cleanup.initial-delay-ms:60000}")
    public void cleanup() {
        Instant cutoff = Instant.now();
        for (int batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
            if (repository.removeExpiredBatch(cutoff, BATCH_SIZE) == 0) break;
        }
    }
}
