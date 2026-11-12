package com.f106.DIO.push.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** 외부 푸시 호출이 다른 예약 작업을 지연시키지 않도록 별도 스케줄러를 사용한다. */
@Configuration(proxyBeanMethods=false)
public class PushDeliverySchedulingConfig {
    @Bean(name="pushDeliveryScheduler", defaultCandidate=false)
    static ThreadPoolTaskScheduler pushDeliveryScheduler() {
        var scheduler=new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);scheduler.setThreadNamePrefix("push-delivery-");
        return scheduler;
    }
}
