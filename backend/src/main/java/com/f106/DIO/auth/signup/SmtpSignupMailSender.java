package com.f106.DIO.auth.signup;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class SmtpSignupMailSender implements SignupMailSender {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SmtpSignupMailSender.class);
    private final ObjectProvider<JavaMailSender> sender;
    private final SignupProperties properties;
    public SmtpSignupMailSender(ObjectProvider<JavaMailSender> sender, SignupProperties properties) {
        this.sender = sender; this.properties = properties;
    }
    public void send(String email, String code) {
        JavaMailSender mail = sender.getIfAvailable();
        if (mail == null || properties.mailFrom().isBlank()) {
            log.warn("Signup mail is not configured: mailSender={}, mailFrom={}", mail != null, !properties.mailFrom().isBlank());
            throw unavailable();
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(properties.mailFrom()); message.setTo(email);
        message.setSubject("[DIO] 회원가입 이메일 인증번호");
        message.setText("회원가입 인증번호: " + code + "\n10분 안에 입력해 주세요. 본인이 요청하지 않았다면 무시해 주세요.");
        try { mail.send(message); } catch (MailException error) {
            // 예외 메시지에는 수신 주소가 들어갈 수 있어 예외 종류만 남긴다.
            log.warn("Signup mail delivery failed: error={}, cause={}", error.getClass().getSimpleName(), rootCause(error));
            throw unavailable();
        }
    }
    private static String rootCause(Throwable error) {
        Throwable cause = error;
        while (cause.getCause() != null && cause.getCause() != cause) cause = cause.getCause();
        return cause.getClass().getName();
    }
    private SignupException unavailable() {
        return new SignupException(HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_DELIVERY_UNAVAILABLE", "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
}
