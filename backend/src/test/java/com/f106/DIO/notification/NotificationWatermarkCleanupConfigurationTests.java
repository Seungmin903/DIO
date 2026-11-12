package com.f106.DIO.notification;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import com.f106.DIO.notification.repository.NotificationWatermarkRepository;
import com.f106.DIO.notification.service.NotificationWatermarkCleanup;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

class NotificationWatermarkCleanupConfigurationTests {
    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(TestConfig.class);

    @Test void enabledByDefault() {
        runner.run(context -> assertThat(context).hasSingleBean(NotificationWatermarkCleanup.class));
    }

    @Test void disabledByProperty() {
        runner.withPropertyValues("dio.notification.watermark-cleanup.enabled=false")
            .run(context -> assertThat(context).doesNotHaveBean(NotificationWatermarkCleanup.class));
    }

    @Test void drainsSeveralBatchesButBoundsEachRun() {
        var repository = mock(NotificationWatermarkRepository.class);
        when(repository.removeExpiredBatch(any(), eq(500))).thenReturn(500);
        new NotificationWatermarkCleanup(repository).cleanup();
        verify(repository, times(10)).removeExpiredBatch(any(), eq(500));
    }

    @Test void stopsWhenBatchIsNotFull() {
        var repository = mock(NotificationWatermarkRepository.class);
        when(repository.removeExpiredBatch(any(), eq(500))).thenReturn(500, 0);
        new NotificationWatermarkCleanup(repository).cleanup();
        verify(repository, times(2)).removeExpiredBatch(any(), eq(500));
    }

    @Configuration(proxyBeanMethods = false)
    @Import(NotificationWatermarkCleanup.class)
    static class TestConfig {
        @Bean NotificationWatermarkRepository repository() { return mock(NotificationWatermarkRepository.class); }
    }
}
