package com.f106.DIO.moderation.service;
import com.f106.DIO.moderation.repository.UserReportRepository;import com.f106.DIO.moderation.infrastructure.mail.SmtpReportMailSender;
import org.springframework.stereotype.Service;import org.springframework.transaction.support.TransactionTemplate;import java.time.Instant;
@Service
public class ReportMailDelivery {
 private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(ReportMailDelivery.class);
 private static final java.time.Duration LEASE=java.time.Duration.ofMinutes(10);
 private final UserReportRepository reports;private final SmtpReportMailSender sender;private final TransactionTemplate transactions;
 public ReportMailDelivery(UserReportRepository reports,SmtpReportMailSender sender,TransactionTemplate transactions){this.reports=reports;this.sender=sender;this.transactions=transactions;}
 public void deliver(long id){
  var report=transactions.execute(status->{
   var row=reports.lock(id).orElse(null);
   if(row==null||"SENT".equals(row.getNotificationStatus())||row.getNotificationNextAttemptAt().isAfter(Instant.now()))return null;
   row.notificationReserved(Instant.now().plus(LEASE));return row;
  });
  if(report==null)return;
  try{sender.send(report);transactions.executeWithoutResult(status->reports.lock(id).ifPresent(row->row.notificationSent()));}
  catch(RuntimeException e){transactions.executeWithoutResult(status->reports.lock(id).ifPresent(row->row.notificationFailed()));LOG.warn("Report notification failed: reportId={}, type={}",id,e.getClass().getSimpleName());}
 }
}
