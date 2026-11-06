package com.f106.DIO.auth.infrastructure.mail;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.auth.exception.SignupException;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

import jakarta.mail.MessagingException;

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
        try {
            var message = mail.createMimeMessage();
            var helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(properties.mailFrom()); helper.setTo(email);
            helper.setSubject("[DIO] 회원가입 이메일 인증번호");
            helper.setText(AuthMailTemplate.text("회원가입 이메일 인증", code, "10분 동안"),
                AuthMailTemplate.html("회원가입을 마무리해 주세요", "DIO에서 함께 기록을 시작하려면 아래 인증번호를 입력해 주세요.", code, "10분 동안"));
            mail.send(message);
        } catch (MailException | MessagingException error) {
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
