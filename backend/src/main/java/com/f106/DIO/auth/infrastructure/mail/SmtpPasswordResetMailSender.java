package com.f106.DIO.auth.infrastructure.mail;

import static com.f106.DIO.auth.domain.PasswordResetPolicy.*;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.auth.exception.PasswordResetException;
import com.f106.DIO.auth.infrastructure.mail.PasswordResetMailSender;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.*;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;

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
        var message = new SimpleMailMessage();
        message.setFrom(properties.mailFrom()); message.setTo(email);
        message.setSubject("[DIO] 비밀번호 재설정 인증번호");
        message.setText("비밀번호 재설정 인증번호: " + code + "\n" + CODE_TTL_SECONDS + "초 안에 입력해 주세요. 본인이 요청하지 않았다면 무시해 주세요.");
        try { mail.send(message); } catch (MailException error) { throw unavailable(); }
    }
    private PasswordResetException unavailable() {
        return new PasswordResetException(HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_DELIVERY_UNAVAILABLE", "인증 메일을 보내지 못했어요.");
    }
}
