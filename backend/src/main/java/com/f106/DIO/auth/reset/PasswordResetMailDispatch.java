package com.f106.DIO.auth.reset;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.*;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;

/** SMTP는 커밋 후 별도 스레드에서 처리해 계정 존재 여부에 따라 HTTP 응답이 SMTP를 기다리지 않게 한다. */
@Component
class PasswordResetMailDispatch {
    record Requested(String email, String code) {
        @Override public String toString() { return "PasswordResetMailRequested[REDACTED]"; }
    }
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(PasswordResetMailDispatch.class);
    private final PasswordResetMailSender sender;
    private final TaskExecutor executor;
    PasswordResetMailDispatch(PasswordResetMailSender sender, @Qualifier("passwordResetMailExecutor") TaskExecutor executor) {
        this.sender = sender; this.executor = executor;
    }
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void dispatch(Requested request) {
        try { executor.execute(() -> {
            try { sender.send(request.email(), request.code()); }
            catch (RuntimeException error) { LOG.warn("Password reset email delivery failed; check SMTP configuration and service availability"); }
        }); } catch (RuntimeException error) { LOG.warn("Password reset email queue unavailable"); }
    }
    @Configuration(proxyBeanMethods = false)
    static class MailExecutorConfig {
        @Bean(name = "passwordResetMailExecutor", defaultCandidate = false)
        ThreadPoolTaskExecutor passwordResetMailExecutor() {
            var executor = new ThreadPoolTaskExecutor();
            executor.setCorePoolSize(1); executor.setMaxPoolSize(2); executor.setQueueCapacity(100);
            executor.setThreadNamePrefix("password-reset-mail-");
            return executor;
        }
    }
}
