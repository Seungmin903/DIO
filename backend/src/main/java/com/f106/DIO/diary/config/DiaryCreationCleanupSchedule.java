package com.f106.DIO.diary.config;

import com.f106.DIO.diary.create.AccountDiaryCreationService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.*;
import org.slf4j.LoggerFactory;

@Configuration(proxyBeanMethods=false)
@EnableScheduling
@ConditionalOnProperty(name="dio.diary.creation-cleanup.enabled",havingValue="true",matchIfMissing=true)
public class DiaryCreationCleanupSchedule {
    private final AccountDiaryCreationService service;
    public DiaryCreationCleanupSchedule(AccountDiaryCreationService service){this.service=service;}
    @Scheduled(fixedDelay=60000,initialDelay=60000)
    public void run() {
        try{service.purgeExpiredResponses();}
        catch(RuntimeException error){LoggerFactory.getLogger(getClass()).error("Diary response cleanup failed: errorType={}",error.getClass().getSimpleName());}
    }
}
