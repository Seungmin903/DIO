package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.auth.exception.PasswordResetException;
import com.f106.DIO.auth.infrastructure.mail.SmtpPasswordResetMailSender;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.*;
import org.springframework.mail.javamail.JavaMailSender;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.io.ByteArrayOutputStream;
import java.util.Properties;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PasswordResetMailTests {
    private final SignupProperties properties = new SignupProperties("", "sender@example.com");
    @Test void smtpMessageIdentifiesPasswordResetAndExpiresInTenMinutes() throws Exception {
        var mail = sender(); var factory = new StaticListableBeanFactory();factory.addBean("mail",mail);
        new SmtpPasswordResetMailSender(factory.getBeanProvider(JavaMailSender.class),properties).send("member@example.com","123456");
        var message = ArgumentCaptor.forClass(MimeMessage.class);verify(mail).send(message.capture());
        assertThat(message.getValue().getSubject()).isEqualTo("[DIO] 비밀번호 재설정 인증번호");
        assertThat(raw(message.getValue())).contains("123456", "text/html");
        assertThat(message.getValue().getAllRecipients()[0].toString()).isEqualTo("member@example.com");
    }
    @Test void transportErrorsAreSanitized() {
        var mail = sender();var factory = new StaticListableBeanFactory();factory.addBean("mail",mail);
        doThrow(new MailSendException("private transport details")).when(mail).send(any(MimeMessage.class));
        assertThatThrownBy(()->new SmtpPasswordResetMailSender(factory.getBeanProvider(JavaMailSender.class),properties).send("member@example.com","123456"))
            .isInstanceOf(PasswordResetException.class).hasMessageNotContaining("private");
    }
    private static JavaMailSender sender() {
        var sender = mock(JavaMailSender.class);
        when(sender.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        return sender;
    }
    private static String raw(MimeMessage message) throws Exception {
        var output = new ByteArrayOutputStream(); message.writeTo(output); return output.toString(java.nio.charset.StandardCharsets.UTF_8);
    }
}
