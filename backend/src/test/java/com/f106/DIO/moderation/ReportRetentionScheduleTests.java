package com.f106.DIO.moderation;
import com.f106.DIO.moderation.config.ReportRetentionSchedule;
import com.f106.DIO.moderation.service.ReportRetentionCleanup;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class ReportRetentionScheduleTests {
 private ApplicationContextRunner runner(){return new ApplicationContextRunner().withBean(ReportRetentionCleanup.class,()->mock(ReportRetentionCleanup.class)).withUserConfiguration(ReportRetentionSchedule.class);}
 @Test void missingFlagDoesNotRegisterDeletionSchedule(){runner().run(c->{assertThat(c).doesNotHaveBean(ReportRetentionSchedule.class);verifyNoInteractions(c.getBean(ReportRetentionCleanup.class));});}
 @Test void explicitFalseDoesNotRegisterDeletionSchedule(){runner().withPropertyValues("dio.moderation.report-retention.enabled=false").run(c->assertThat(c).doesNotHaveBean(ReportRetentionSchedule.class));}
 @Test void explicitTrueRegistersScheduleWithoutImmediateDeletion(){runner().withPropertyValues("dio.moderation.report-retention.enabled=true").run(c->{assertThat(c).hasSingleBean(ReportRetentionSchedule.class);verifyNoInteractions(c.getBean(ReportRetentionCleanup.class));});}
 @Test void yamlFallbackIsAlsoFalse() throws Exception {
  Object value=null;
  for(var url:java.util.Collections.list(getClass().getClassLoader().getResources("application.yml"))){
   for(var source:new YamlPropertySourceLoader().load("app",new org.springframework.core.io.UrlResource(url))){
    Object candidate=source.getProperty("dio.moderation.report-retention.enabled");
    if(candidate!=null)value=candidate;
   }
  }
  assertThat(value).isNotNull();
  assertThat(new MockEnvironment().resolveRequiredPlaceholders(value.toString())).isEqualTo("false");
 }
}
