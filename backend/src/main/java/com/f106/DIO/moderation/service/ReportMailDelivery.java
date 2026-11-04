package com.f106.DIO.moderation.service;
import com.f106.DIO.moderation.repository.UserReportRepository;import com.f106.DIO.moderation.infrastructure.mail.SmtpReportMailSender;
import org.springframework.stereotype.Service;import org.springframework.transaction.annotation.Transactional;import java.time.Instant;
@Service
public class ReportMailDelivery {
 private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(ReportMailDelivery.class);
 private final UserReportRepository reports;private final SmtpReportMailSender sender;
 public ReportMailDelivery(UserReportRepository reports,SmtpReportMailSender sender){this.reports=reports;this.sender=sender;}
 @Transactional public void deliver(long id){
  var report=reports.lock(id).orElse(null);
  if(report==null||"SENT".equals(report.getNotificationStatus())||report.getNotificationNextAttemptAt().isAfter(Instant.now()))return;
  try{sender.send(report);report.notificationSent();}
  catch(RuntimeException e){report.notificationFailed();LOG.warn("Report notification failed: reportId={}, type={}",id,e.getClass().getSimpleName());}
 }
}
