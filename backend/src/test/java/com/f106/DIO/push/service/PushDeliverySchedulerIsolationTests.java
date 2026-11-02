package com.f106.DIO.push.service;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.Scheduled;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:push-scheduler;MODE=PostgreSQL","dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="})
@Import(PushDeliverySchedulerIsolationTests.Config.class)
class PushDeliverySchedulerIsolationTests {
 @Autowired Probes probes;
 @Test void slowPushScheduleDoesNotBlockOtherScheduledJobs() throws Exception {
  try { assertThat(probes.pushStarted.await(5,TimeUnit.SECONDS)).isTrue();assertThat(probes.otherRan.await(3,TimeUnit.SECONDS)).isTrue(); }
  finally {probes.release.countDown();}
 }
 @TestConfiguration(proxyBeanMethods=false) static class Config { @Bean Probes probes(){return new Probes();} }
 static class Probes {
  final CountDownLatch pushStarted=new CountDownLatch(1),otherRan=new CountDownLatch(1),release=new CountDownLatch(1);
  @Scheduled(initialDelay=100,fixedDelay=600000,scheduler="pushDeliveryScheduler") void slowPush(){pushStarted.countDown();try{release.await(10,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}}
  @Scheduled(initialDelay=100,fixedDelay=600000) void other(){try{if(pushStarted.await(5,TimeUnit.SECONDS))otherRan.countDown();}catch(InterruptedException e){Thread.currentThread().interrupt();}}
 }
}
