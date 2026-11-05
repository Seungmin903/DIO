package com.f106.DIO.moderation.infrastructure.mail;

import org.springframework.stereotype.Component;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

/** Fixed operational notice only. This sender receives neither a report nor evidence storage access. */
@Component
public class SmtpReportMailSender {
 private final ObjectProvider<JavaMailSender> mail;
 private final String recipient,from;
 public SmtpReportMailSender(ObjectProvider<JavaMailSender> mail,@Value("${dio.moderation.report-mail.to:}") String recipient,@Value("${dio.signup.mail-from:}") String from){
  this.mail=mail;this.recipient=recipient;this.from=from;
 }
 public void send(){
  var sender=mail.getIfAvailable();
  if(sender==null||recipient.isBlank()||from.isBlank())throw new IllegalStateException("Report mail not configured");
  var message=new SimpleMailMessage();
  message.setFrom(from);message.setTo(recipient);
  message.setSubject("[DIO] 새 신고가 접수됐습니다");
  message.setText("새 신고가 접수됐습니다.");
  sender.send(message);
 }
}
