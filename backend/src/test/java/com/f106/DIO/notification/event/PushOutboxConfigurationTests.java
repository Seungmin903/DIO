package com.f106.DIO.notification.event;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class PushOutboxConfigurationTests {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
        .withBean(InvitationNotificationRepository.class, () -> mock(InvitationNotificationRepository.class))
        .withBean(InvitationNotificationHandler.class);

    @Test void disabledOutboxAllowsUnsetScope() {
        context.run(c -> assertThat(c).hasNotFailed());
    }

    @Test void enabledOutboxRejectsInvalidSettingsDuringStartup() {
        context.withPropertyValues("dio.push.outbox.enabled=true", "dio.push.environment=development")
            .run(c -> assertThat(c).hasFailed());
        context.withPropertyValues("dio.push.outbox.enabled=true", "dio.push.outbox.ttl-seconds=60", "dio.push.environment=bad scope")
            .run(c -> assertThat(c).hasFailed());
    }

    @Test void enabledOutboxAcceptsValidSettings() {
        context.withPropertyValues("dio.push.outbox.enabled=true", "dio.push.outbox.ttl-seconds=60", "dio.push.environment=development", "dio.push.app-id=dio")
            .run(c -> assertThat(c).hasNotFailed());
    }
}
