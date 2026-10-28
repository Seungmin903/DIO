package com.f106.DIO.diary.expiry;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DiaryExpiryScheduleTests {
    final ExpiredDiaryCleanup cleanup=mock(ExpiredDiaryCleanup.class);
    ApplicationContextRunner context() {return new ApplicationContextRunner().withUserConfiguration(DiaryExpirySchedule.class)
        .withBean(ExpiredDiaryCleanup.class,()->cleanup).withPropertyValues("dio.diary.expiry-cleanup.initial-delay-ms=3600000");}
    @Test void disabledByDefaultAndWhenExplicitlyDisabled() {
        context().run(c->assertThat(c).doesNotHaveBean(DiaryExpirySchedule.class));
        context().withPropertyValues("dio.diary.expiry-cleanup.enabled=false").run(c->assertThat(c).doesNotHaveBean(DiaryExpirySchedule.class));
        verifyNoInteractions(cleanup);
    }
    @Test void explicitlyEnabledSchedulerInvokesCleanupAndContainsFailures() {
        when(cleanup.run()).thenReturn(new ExpiredDiaryCleanup.Result(1,1,0,0)).thenThrow(new IllegalStateException("private SQL"));
        context().withPropertyValues("dio.diary.expiry-cleanup.enabled=true").run(c->{
            var scheduler=c.getBean(DiaryExpirySchedule.class);scheduler.run();assertThatCode(scheduler::run).doesNotThrowAnyException();
        });
        verify(cleanup,times(2)).run();
    }
    ApplicationContextRunner engineContext() {
        return new ApplicationContextRunner().withUserConfiguration(ExpiredDiaryCleanup.class)
            .withBean(org.springframework.jdbc.core.JdbcTemplate.class,()->mock(org.springframework.jdbc.core.JdbcTemplate.class))
            .withBean(com.f106.DIO.diary.detail.DiaryDetailRepository.class,()->mock(com.f106.DIO.diary.detail.DiaryDetailRepository.class))
            .withBean(org.springframework.transaction.PlatformTransactionManager.class,()->mock(org.springframework.transaction.PlatformTransactionManager.class));
    }
    @Test void disabledEngineDoesNotBindOrValidateItsUnusedBatchSettings() {
        for(String enabled:new String[]{"false",""}) {
            var runner=engineContext().withPropertyValues("dio.diary.expiry-cleanup.batch-size=invalid","dio.diary.expiry-cleanup.lock-timeout-ms=-1");
            if(!enabled.isEmpty()) runner=runner.withPropertyValues("dio.diary.expiry-cleanup.enabled="+enabled);
            runner.run(c->{assertThat(c).hasNotFailed();assertThat(c).doesNotHaveBean(ExpiredDiaryCleanup.class);});
        }
    }
    @Test void enabledEngineStillRejectsInvalidConfigurationAndAcceptsValidConfiguration() {
        engineContext().withPropertyValues("dio.diary.expiry-cleanup.enabled=true","dio.diary.expiry-cleanup.batch-size=0")
            .run(c->assertThat(c).hasFailed());
        engineContext().withPropertyValues("dio.diary.expiry-cleanup.enabled=true")
            .run(c->{assertThat(c).hasNotFailed();assertThat(c).hasSingleBean(ExpiredDiaryCleanup.class);});
    }
}
