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
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.MimeMessage;
import java.io.ByteArrayInputStream;
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
        MimeMessage rendered = rendered(message.getValue());
        assertThat(part(rendered, "text/plain")).contains("123456", "600초 동안", "본인이 요청하지 않았다면");
        assertThat(part(rendered, "text/html")).contains("123456", "600초 동안", "본인이 요청하지 않았다면");
        assertThat(message.getValue().getAllRecipients()).extracting(Object::toString).containsExactly("member@example.com");
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
    private static MimeMessage rendered(MimeMessage message) throws Exception {
        var output = new ByteArrayOutputStream(); message.writeTo(output);
        return new MimeMessage(Session.getInstance(new Properties()), new ByteArrayInputStream(output.toByteArray()));
    }
    private static String part(Part part, String mimeType) throws Exception {
        Object body = part.getContent();
        if (part.isMimeType(mimeType) && body instanceof String text) return text;
        if (!(body instanceof Multipart multipart)) return null;
        for (int index = 0; index < multipart.getCount(); index++) {
            String content = part(multipart.getBodyPart(index), mimeType);
            if (content != null) return content;
        }
        return null;
    }
}
