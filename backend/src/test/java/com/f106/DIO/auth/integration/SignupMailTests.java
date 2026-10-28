package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.auth.exception.SignupException;
import com.f106.DIO.auth.infrastructure.mail.SmtpSignupMailSender;
import com.f106.DIO.auth.support.SignupSecrets;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SignupMailTests {
    @Test void missingSecretFailsClosed() {
        assertThatThrownBy(() -> SignupSecrets.codeHash("", "member@example.com", "123456"))
            .isInstanceOfSatisfying(SignupException.class, e -> assertThat(e.code).isEqualTo("VERIFICATION_NOT_CONFIGURED"));
    }
    @Test void missingSmtpDoesNotPretendToSend() {
        ObjectProvider<JavaMailSender> provider = provider(null);
        assertThatThrownBy(() -> new SmtpSignupMailSender(provider, properties()).send("member@example.com", "123456"))
            .isInstanceOfSatisfying(SignupException.class, e -> assertThat(e.code).isEqualTo("EMAIL_DELIVERY_UNAVAILABLE"));
    }
    @Test void smtpFailureIsSanitized() {
        JavaMailSender sender = mock(JavaMailSender.class);
        doThrow(new MailSendException("internal SMTP details")).when(sender).send(any(SimpleMailMessage.class));
        assertThatThrownBy(() -> new SmtpSignupMailSender(provider(sender), properties()).send("member@example.com", "123456"))
            .isInstanceOf(SignupException.class).hasMessageNotContaining("internal SMTP");
    }
    @Test void messageUsesConfiguredSenderAndOnlyIntendedRecipient() {
        JavaMailSender sender = mock(JavaMailSender.class);
        new SmtpSignupMailSender(provider(sender), properties()).send("member@example.com", "123456");
        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(captor.capture());
        assertThat(captor.getValue().getFrom()).isEqualTo("noreply@example.com");
        assertThat(captor.getValue().getTo()).containsExactly("member@example.com");
        assertThat(captor.getValue().getText()).contains("123456");
    }
    @SuppressWarnings("unchecked")
    ObjectProvider<JavaMailSender> provider(JavaMailSender sender) {
        ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(sender); return provider;
    }
    SignupProperties properties() { return new SignupProperties("test-secret-at-least-32-bytes-long", "noreply@example.com"); }
}
