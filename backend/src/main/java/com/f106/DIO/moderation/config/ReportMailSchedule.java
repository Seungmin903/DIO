package com.f106.DIO.moderation.config;
import com.f106.DIO.moderation.repository.UserReportRepository;import com.f106.DIO.moderation.service.ReportMailDelivery;
import org.springframework.stereotype.Component;import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Qualifier;
import java.time.Instant;import org.springframework.data.domain.PageRequest;import java.util.concurrent.*;import java.util.concurrent.atomic.AtomicBoolean;
@Component @ConditionalOnProperty(name="dio.moderation.report-mail.enabled",havingValue="true")
public class ReportMailSchedule {
 private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(ReportMailSchedule.class);
 private final UserReportRepository reports;private final ReportMailDelivery delivery;private final Executor executor;
 private final AtomicBoolean running=new AtomicBoolean();
 public ReportMailSchedule(UserReportRepository reports,ReportMailDelivery delivery,@Qualifier("reportMailExecutor") Executor executor){this.reports=reports;this.delivery=delivery;this.executor=executor;}
 @Scheduled(fixedDelayString="${dio.moderation.report-mail.delay-ms:60000}",initialDelayString="${dio.moderation.report-mail.initial-delay-ms:10000}")
 public void dispatch(){
  if(!running.compareAndSet(false,true))return;
  try{executor.execute(()->{try{
   for(long id:reports.due(Instant.now(),PageRequest.of(0,20)))try{delivery.deliver(id);}catch(RuntimeException e){LOG.warn("Report delivery transaction failed: reportId={}, type={}",id,e.getClass().getSimpleName());}
  }catch(RuntimeException e){LOG.warn("Report notification scan failed: type={}",e.getClass().getSimpleName());}finally{running.set(false);}});}
  catch(RejectedExecutionException e){running.set(false);LOG.warn("Report notification executor unavailable");}
 }
}
