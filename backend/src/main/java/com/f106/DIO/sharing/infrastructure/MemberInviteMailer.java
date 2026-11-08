package com.f106.DIO.sharing.infrastructure;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.sharing.service.MemberInviteMailRequested;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class MemberInviteMailer {
    private static final Logger log = LoggerFactory.getLogger(MemberInviteMailer.class);
    private final ObjectProvider<JavaMailSender> mail;
    private final SignupProperties signup;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
        1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(128),
        task -> new Thread(task, "member-invite-mail"));

    public MemberInviteMailer(ObjectProvider<JavaMailSender> mail, SignupProperties signup) {
        this.mail = mail;
        this.signup = signup;
    }

    @TransactionalEventListener
    public void afterCommit(MemberInviteMailRequested event) {
        if (signup.mailFrom().isBlank()) return;
        try {
            executor.execute(() -> deliver(event));
        } catch (RejectedExecutionException error) {
            log.warn("Invitation mail queue unavailable: inviteId={}", event.inviteId());
        }
    }

    private void deliver(MemberInviteMailRequested event) {
        try {
            var sender = mail.getIfAvailable();
            if (sender == null) {
                log.warn("Invitation SMTP unavailable: inviteId={}", event.inviteId());
                return;
            }
            var message = new SimpleMailMessage();
            message.setFrom(signup.mailFrom());
            message.setTo(event.recipient());
            message.setSubject("[DIO] 공유 다이어리 초대가 도착했어요");
            message.setText("DIO에서 공유 다이어리 초대를 받았어요.\n"
                + "DIO 앱에 로그인한 뒤 ‘받은 초대’에서 확인해 주세요.");
            sender.send(message);
        } catch (RuntimeException error) {
            log.warn("Invitation mail delivery failed: inviteId={}, error={}",
                event.inviteId(), error.getClass().getSimpleName());
        }
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }
}
