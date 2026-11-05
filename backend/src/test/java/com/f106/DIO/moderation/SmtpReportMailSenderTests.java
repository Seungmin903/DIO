package com.f106.DIO.moderation;

import com.f106.DIO.media.storage.MediaStorage;
import com.f106.DIO.moderation.infrastructure.mail.SmtpReportMailSender;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import jakarta.mail.internet.MimeMessage;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SmtpReportMailSenderTests {
    @SuppressWarnings("unchecked")
    private SmtpReportMailSender sender(JavaMailSender smtp){
        var provider=mock(ObjectProvider.class);when(provider.getIfAvailable()).thenReturn(smtp);
        return new SmtpReportMailSender(provider,"ops@example.com","reports@example.com");
    }
    @Test void sendsOnlyFixedNoticeWithoutPerReportHeadersOrAttachments(){
        var smtp=mock(JavaMailSender.class);var sender=sender(smtp);
        sender.send();sender.send();
        var capture=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);verify(smtp,times(2)).send(capture.capture());
        for(var message:capture.getAllValues()){
            assertThat(message.getSubject()).isEqualTo("[DIO] 새 신고가 접수됐습니다");
            assertThat(message.getText()).isEqualTo("새 신고가 접수됐습니다.");
            assertThat(message.getFrom()).isEqualTo("reports@example.com");
            assertThat(message.getTo()).containsExactly("ops@example.com");
            assertThat(message.getCc()).isNull();assertThat(message.getBcc()).isNull();
            assertThat(message.getReplyTo()).isNull();assertThat(message.getSentDate()).isNull();
        }
        verify(smtp,never()).createMimeMessage();verify(smtp,never()).send(any(MimeMessage.class));
    }
    @Test void oldAttachmentSettingCannotReenableEvidenceForwarding(){
        var smtp=mock(JavaMailSender.class);var storage=mock(MediaStorage.class);
        new ApplicationContextRunner().withUserConfiguration(SmtpReportMailSender.class)
            .withBean(JavaMailSender.class,()->smtp).withBean(MediaStorage.class,()->storage)
            .withPropertyValues("dio.moderation.report-mail.to=ops@example.com","dio.signup.mail-from=reports@example.com",
                "dio.moderation.report-mail.attach-evidence=true","REPORT_NOTIFICATION_ATTACH_EVIDENCE=true")
            .run(context->{
                assertThat(context).hasNotFailed();context.getBean(SmtpReportMailSender.class).send();
                var capture=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);verify(smtp).send(capture.capture());
                assertThat(capture.getValue().getText()).isEqualTo("새 신고가 접수됐습니다.");
                verifyNoInteractions(storage);verify(smtp,never()).createMimeMessage();
            });
    }
    @Test void smtpFailureStillPropagatesForExistingRetryMechanism(){
        var smtp=mock(JavaMailSender.class);var failure=new MailSendException("temporary SMTP failure");
        doThrow(failure).when(smtp).send(any(SimpleMailMessage.class));
        assertThatThrownBy(()->sender(smtp).send()).isSameAs(failure);
    }
}
