package com.f106.DIO.moderation.infrastructure.mail;

import com.f106.DIO.moderation.domain.UserReport;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import jakarta.mail.MessagingException;

@Component
public class SmtpReportMailSender {
 private final ObjectProvider<JavaMailSender> mail;
 private final String recipient,from;
 private final ReportMailEvidence evidence;
 private final boolean attachEvidence;
 public SmtpReportMailSender(ObjectProvider<JavaMailSender> mail,@Value("${dio.moderation.report-mail.to:}") String recipient,@Value("${dio.signup.mail-from:}") String from,ReportMailEvidence evidence,@Value("${dio.moderation.report-mail.attach-evidence:false}") boolean attachEvidence){
  this.mail=mail;this.recipient=recipient;this.from=from;this.evidence=evidence;this.attachEvidence=attachEvidence;
 }
 public void send(UserReport report){
  var sender=mail.getIfAvailable();
  if(sender==null||recipient.isBlank()||from.isBlank())throw new IllegalStateException("Report mail not configured");
  String subject="[DIO] 사용자 신고 접수 #"+report.getReportId();
  String text="신고 번호: "+report.getReportId()+"\n사유: "+report.getReasonCode()+"\n신고자 ID: "+report.getReporterUserId()+"\n신고 대상 ID: "+report.getReportedUserId()+"\n접수 시각: "+report.getCreatedAt();
  var attachments=java.util.List.<ReportMailEvidence.Attachment>of();boolean evidenceUnavailable=false;
  if(attachEvidence)try{attachments=evidence.read(report);}catch(InvalidReportMailEvidenceException e){evidenceUnavailable=true;org.slf4j.LoggerFactory.getLogger(SmtpReportMailSender.class).warn("Report evidence attachment unavailable: type={}",e.getClass().getSimpleName());}
  if(attachments.isEmpty()){
   var message=new SimpleMailMessage();message.setFrom(from);message.setTo(recipient);message.setSubject(subject);
   message.setText(text+(evidenceUnavailable?"\n증빙 첨부를 준비하지 못했습니다. 권한 있는 운영 절차로 서버 증빙을 확인해 주세요.":"\n비공개 증빙과 상세 내용은 권한 있는 운영 절차로 확인해 주세요."));sender.send(message);return;
  }
  try{
   var message=sender.createMimeMessage();var helper=new MimeMessageHelper(message,true,"UTF-8");
   helper.setFrom(from);helper.setTo(recipient);helper.setSubject(subject);
   helper.setText(text+"\n증빙 사진 "+attachments.size()+"장을 첨부했습니다. -preview 파일은 메일 크기 제한을 위한 축소본이며 원본은 서버에 보존됩니다.\n증빙은 신고 검토 목적으로만 이용하고 후속 처리 종료 후 메일함과 휴지통에서도 삭제해 주세요.",false);
   for(var attachment:attachments)helper.addAttachment(attachment.name(),new ByteArrayResource(attachment.bytes()),attachment.mime());
   sender.send(message);
  }catch(MessagingException e){throw new IllegalStateException("Report attachment mail failed",e);}
 }
}
