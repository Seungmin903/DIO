package com.f106.DIO.auth.infrastructure.mail;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.auth.exception.SignupException;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class SmtpSignupMailSender implements SignupMailSender {
    private final ObjectProvider<JavaMailSender> sender;
    private final SignupProperties properties;
    public SmtpSignupMailSender(ObjectProvider<JavaMailSender> sender, SignupProperties properties) {
        this.sender = sender; this.properties = properties;
    }
    public void send(String email, String code) {
        JavaMailSender mail = sender.getIfAvailable();
        if (mail == null || properties.mailFrom().isBlank()) throw unavailable();
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(properties.mailFrom()); message.setTo(email);
        message.setSubject("[DIO] 회원가입 이메일 인증번호");
        message.setText("회원가입 인증번호: " + code + "\n10분 안에 입력해 주세요. 본인이 요청하지 않았다면 무시해 주세요.");
        try { mail.send(message); } catch (MailException error) { throw unavailable(); }
    }
    private SignupException unavailable() {
        return new SignupException(HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_DELIVERY_UNAVAILABLE", "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
}
