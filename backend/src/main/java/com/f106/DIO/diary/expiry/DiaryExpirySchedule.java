package com.f106.DIO.diary.expiry;

import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.*;

@Configuration(proxyBeanMethods=false)
@EnableScheduling
@ConditionalOnProperty(name="dio.diary.expiry-cleanup.enabled",havingValue="true")
public class DiaryExpirySchedule {
    private final ExpiredDiaryCleanup cleanup;
    public DiaryExpirySchedule(ExpiredDiaryCleanup cleanup) {this.cleanup=cleanup;}
    @Scheduled(fixedDelayString="${dio.diary.expiry-cleanup.delay-ms:60000}",initialDelayString="${dio.diary.expiry-cleanup.initial-delay-ms:300000}")
    public void run() {
        try {
            var result=cleanup.run();
            if(result.examined()>0) LoggerFactory.getLogger(getClass()).info("Expired diary cleanup: examined={},deleted={},skipped={},failed={}",result.examined(),result.deleted(),result.skipped(),result.failed());
        } catch(RuntimeException error) {
            LoggerFactory.getLogger(getClass()).error("Expired diary cleanup failed: errorType={}",error.getClass().getSimpleName());
        }
    }
}
