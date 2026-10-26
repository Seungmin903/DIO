package com.f106.DIO.auth.reset;

import com.f106.DIO.auth.signup.SignupProperties;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.*;
import org.springframework.mail.javamail.JavaMailSender;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PasswordResetMailTests {
    private final SignupProperties properties = new SignupProperties("", "sender@example.com", "v1", "v1", "v1");
    @Test void smtpMessageIdentifiesPasswordResetAndExpiresInTenMinutes() {
        var mail = mock(JavaMailSender.class); var factory = new StaticListableBeanFactory();factory.addBean("mail",mail);
        new SmtpPasswordResetMailSender(factory.getBeanProvider(JavaMailSender.class),properties).send("member@example.com","123456");
        var message = ArgumentCaptor.forClass(SimpleMailMessage.class);verify(mail).send(message.capture());
        assertThat(message.getValue().getSubject()).isEqualTo("[DIO] 비밀번호 재설정 인증번호");
        assertThat(message.getValue().getText()).contains("123456","10분","본인이 요청하지 않았다면");
        assertThat(message.getValue().getTo()).containsExactly("member@example.com");
    }
    @Test void transportErrorsAreSanitized() {
        var mail = mock(JavaMailSender.class);var factory = new StaticListableBeanFactory();factory.addBean("mail",mail);
        doThrow(new MailSendException("private transport details")).when(mail).send(any(SimpleMailMessage.class));
        assertThatThrownBy(()->new SmtpPasswordResetMailSender(factory.getBeanProvider(JavaMailSender.class),properties).send("member@example.com","123456"))
            .isInstanceOf(PasswordResetException.class).hasMessageNotContaining("private");
    }
}
