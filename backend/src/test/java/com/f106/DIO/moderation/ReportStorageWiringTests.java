package com.f106.DIO.moderation;
import com.f106.DIO.media.storage.*;import com.f106.DIO.moderation.service.*;import com.f106.DIO.moderation.repository.UserReportRepository;import com.f106.DIO.sharing.service.SharingAccessService;
import org.junit.jupiter.api.Test;import org.springframework.context.annotation.*;import org.springframework.boot.test.context.runner.ApplicationContextRunner;import org.springframework.mock.env.MockEnvironment;import org.springframework.jdbc.core.JdbcTemplate;import tools.jackson.databind.ObjectMapper;
import java.util.*;import static org.assertj.core.api.Assertions.*;import static org.mockito.Mockito.*;
class ReportStorageWiringTests {
 @Configuration(proxyBeanMethods=false) @Import(ReportService.class) static class Config {
  @Bean MediaStorage localStore(){var store=mock(MediaStorage.class);when(store.provider()).thenReturn("LOCAL");return store;}
  @Bean MediaStorage s3Store(){var store=mock(MediaStorage.class);when(store.provider()).thenReturn("S3");return store;}
  @Bean MediaFiles files(List<MediaStorage> stores){return new MediaFiles(stores,"s3",new MockEnvironment());}
  @Bean UserReportRepository reports(){return mock(UserReportRepository.class);}
  @Bean SharingAccessService access(){return mock(SharingAccessService.class);}
  @Bean ReportEvidence evidence(){return new ReportEvidence();}
  @Bean ObjectMapper json(){return new ObjectMapper();}
  @Bean JdbcTemplate jdbc(){return mock(JdbcTemplate.class);}
 }
 @Test void reportServiceResolvesConfiguredStorageWhenLocalAndS3BothExist(){
  new ApplicationContextRunner().withUserConfiguration(Config.class).withPropertyValues("dio.media.storage=s3").run(context->{
   assertThat(context).hasNotFailed().hasSingleBean(ReportService.class);context.getBean(MediaFiles.class).put("test",new byte[0],"image/png");
   verify(context.getBean("s3Store",MediaStorage.class)).put(eq("test"),any(),eq("image/png"));verify(context.getBean("localStore",MediaStorage.class),never()).put(anyString(),any(),anyString());
  });
 }
}
