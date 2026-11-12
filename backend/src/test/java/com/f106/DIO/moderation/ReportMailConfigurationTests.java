package com.f106.DIO.moderation;

import com.f106.DIO.moderation.config.ReportMailConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.task.TaskExecutionAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Qualifier;
import java.util.concurrent.Executor;
import org.springframework.mail.javamail.JavaMailSender;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReportMailConfigurationTests {
    private ApplicationContextRunner runner(){
        return new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(TaskExecutionAutoConfiguration.class))
            .withUserConfiguration(ReportMailConfiguration.class);
    }
    private ApplicationContextRunner enabled(){
        return runner().withBean(JavaMailSender.class,()->mock(JavaMailSender.class))
            .withPropertyValues("dio.moderation.report-mail.enabled=true","spring.mail.host=smtp.example.com",
                "dio.moderation.report-mail.to=ops@example.com","dio.signup.mail-from=reports@example.com");
    }
    @Test void disabledMailDoesNotRequireSmtpSettings(){runner().run(c->assertThat(c).hasNotFailed().hasBean("applicationTaskExecutor").doesNotHaveBean("reportMailExecutor"));}
    @Test void enabledMailAcceptsExistingSmtpAndAddresses(){enabled().run(c->assertThat(c).hasNotFailed().hasBean("applicationTaskExecutor").hasBean("reportMailExecutor"));}
    record Executors(Executor application,Executor report){}
    @Configuration(proxyBeanMethods=false) static class ExecutorConsumers {
        @Bean Executors executors(Executor application,@Qualifier("reportMailExecutor") Executor report){return new Executors(application,report);}
    }
    @Test void enabledMailKeepsDefaultExecutorInjectionSeparateFromQualifiedMailExecutor(){
        enabled().withUserConfiguration(ExecutorConsumers.class).run(c->{
            assertThat(c).hasNotFailed();
            var executors=c.getBean(Executors.class);
            assertThat(executors.application()).isSameAs(c.getBean("applicationTaskExecutor"));
            assertThat(executors.report()).isSameAs(c.getBean("reportMailExecutor")).isNotSameAs(executors.application());
        });
    }
    @Test void missingToOrFromFailsAtStartup(){
        for(String setting:new String[]{"dio.moderation.report-mail.to","dio.signup.mail-from"})
            enabled().withPropertyValues(setting+"=").run(c->assertThat(c).hasFailed());
    }
    @Test void malformedAddressOrMissingHostFailsAtStartup(){
        enabled().withPropertyValues("dio.moderation.report-mail.to=not-an-email").run(c->assertThat(c).hasFailed());
        enabled().withPropertyValues("spring.mail.host=").run(c->assertThat(c).hasFailed());
    }
    @Test void missingSenderFailsAtStartup(){
        runner().withPropertyValues("dio.moderation.report-mail.enabled=true","spring.mail.host=smtp.example.com",
            "dio.moderation.report-mail.to=ops@example.com","dio.signup.mail-from=reports@example.com").run(c->assertThat(c).hasFailed());
    }
}
