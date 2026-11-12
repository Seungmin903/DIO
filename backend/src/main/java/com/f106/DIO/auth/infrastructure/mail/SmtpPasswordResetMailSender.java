package com.f106.DIO.auth.infrastructure.mail;

import static com.f106.DIO.auth.domain.PasswordResetPolicy.*;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.auth.exception.PasswordResetException;
import com.f106.DIO.auth.infrastructure.mail.PasswordResetMailSender;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.*;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;

import jakarta.mail.MessagingException;

@Component
public class SmtpPasswordResetMailSender implements PasswordResetMailSender {
    private final ObjectProvider<JavaMailSender> sender;
    private final SignupProperties properties;
    public SmtpPasswordResetMailSender(ObjectProvider<JavaMailSender> sender, SignupProperties properties) {
        this.sender = sender; this.properties = properties;
    }
    public void send(String email, String code) {
        JavaMailSender mail = sender.getIfAvailable();
        if (mail == null || properties.mailFrom().isBlank()) throw unavailable();
        try {
            var message = mail.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(properties.mailFrom()); helper.setTo(email);
            helper.setSubject("[DIO] 비밀번호 재설정 인증번호");
            helper.setText(AuthMailTemplate.text("비밀번호 재설정 인증", code, CODE_TTL_SECONDS + "초 동안"),
                AuthMailTemplate.html("비밀번호를 다시 설정해 주세요", "아래 인증번호를 입력하면 비밀번호를 다시 설정할 수 있어요.", code, CODE_TTL_SECONDS + "초 동안"));
            mail.send(message);
        } catch (MailException | MessagingException error) { throw unavailable(); }
    }
    private PasswordResetException unavailable() {
        return new PasswordResetException(HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_DELIVERY_UNAVAILABLE", "인증 메일을 보내지 못했어요.");
    }
}
