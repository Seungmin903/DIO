package com.f106.DIO.push.config;

import com.f106.DIO.push.service.PushRegistrationCleanup;
import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration(proxyBeanMethods=false)
@org.springframework.scheduling.annotation.EnableScheduling
@ConditionalOnProperty(name="dio.push.cleanup.enabled",havingValue="true",matchIfMissing=true)
public class PushRegistrationCleanupSchedule {
    private final PushRegistrationCleanup cleanup;
    public PushRegistrationCleanupSchedule(PushRegistrationCleanup cleanup){this.cleanup=cleanup;}
    @Scheduled(fixedDelayString="${dio.push.cleanup.delay-ms:60000}",initialDelayString="${dio.push.cleanup.initial-delay-ms:300000}")
    public void cleanup(){cleanup.clearExpired(Instant.now());}
}
