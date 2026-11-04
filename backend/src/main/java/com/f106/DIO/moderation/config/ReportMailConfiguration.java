package com.f106.DIO.moderation.config;
import org.springframework.context.annotation.*;import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import java.util.concurrent.*;
@Configuration(proxyBeanMethods=false) @ConditionalOnProperty(name="dio.moderation.report-mail.enabled",havingValue="true")
public class ReportMailConfiguration {
 @Bean(name="reportMailExecutor",destroyMethod="shutdown") public ExecutorService reportMailExecutor(){
  // Slow SMTP must never block the shared scheduler used by socket/session checks.
  return new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(1),r->{var t=new Thread(r,"report-mail");t.setDaemon(true);return t;});
 }
}
