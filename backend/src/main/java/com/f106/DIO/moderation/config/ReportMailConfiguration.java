package com.f106.DIO.moderation.config;
import org.springframework.context.annotation.*;import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import java.util.concurrent.*;
@Configuration(proxyBeanMethods=false) @ConditionalOnProperty(name="dio.moderation.report-mail.enabled",havingValue="true")
public class ReportMailConfiguration {
 @Bean public org.springframework.beans.factory.InitializingBean reportMailSettings(
   org.springframework.beans.factory.ObjectProvider<org.springframework.mail.javamail.JavaMailSender> mail,
   @org.springframework.beans.factory.annotation.Value("${dio.moderation.report-mail.to:}") String to,
   @org.springframework.beans.factory.annotation.Value("${dio.signup.mail-from:}") String from,
   @org.springframework.beans.factory.annotation.Value("${spring.mail.host:}") String host){
  return ()->{
   if(mail.getIfAvailable()==null||host.isBlank())throw new IllegalStateException("REPORT_NOTIFICATION_ENABLED requires an SMTP sender and SPRING_MAIL_HOST");
   validateAddress(to,"REPORT_NOTIFICATION_TO");validateAddress(from,"SIGNUP_MAIL_FROM");
  };
 }
 private static void validateAddress(String value,String setting){
  try{
   if(value.isBlank()||value.contains("\r")||value.contains("\n"))throw new jakarta.mail.internet.AddressException();
   new jakarta.mail.internet.InternetAddress(value,true).validate();
  }catch(jakarta.mail.internet.AddressException error){throw new IllegalStateException("REPORT_NOTIFICATION_ENABLED requires a valid "+setting);}
 }

 @Bean(name="reportMailExecutor",defaultCandidate=false,destroyMethod="shutdown") public ExecutorService reportMailExecutor(){
  // Slow SMTP must never block the shared scheduler used by socket/session checks.
  return new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(1),r->{var t=new Thread(r,"report-mail");t.setDaemon(true);return t;});
 }
}
