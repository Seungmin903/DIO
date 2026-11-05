package com.f106.DIO.moderation;
import com.f106.DIO.moderation.service.ReportRetentionCleanup;
import com.f106.DIO.media.storage.MediaFiles;
import java.time.*;import java.util.*;
import org.junit.jupiter.api.*;import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;import static org.mockito.Mockito.*;
@SpringBootTest(properties={"spring.flyway.enabled=true","spring.jpa.hibernate.ddl-auto=validate",
 "dio.moderation.report-retention.enabled=false","dio.moderation.report-mail.enabled=false"})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="DIO_REPORT_RETENTION_QA",matches="true")
class ReportRetentionPostgresTests {
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){
  String url=System.getenv("DIO_REPORT_RETENTION_URL");
  if(url==null||!url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_report_retention_qa"))throw new IllegalStateException("Explicit disposable report retention DB required");
  r.add("spring.datasource.url",()->url);r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->System.getenv("DIO_REPORT_RETENTION_PASSWORD"));
 }
 @Autowired JdbcTemplate jdbc; @Autowired ReportRetentionCleanup cleanup; @MockitoBean MediaFiles files;
 @BeforeEach void fixtures(){
  reset(files);jdbc.update("delete from report_evidence_deletion_queue");jdbc.update("delete from user_reports");
  jdbc.update("insert into users(user_id,nickname,nickname_key) values(101,'a','a'),(102,'b','b') on conflict do nothing");
 }
 private long report(String evidence,String status,int days){return jdbc.queryForObject("insert into user_reports(reporter_user_id,reported_user_id,diary_id,client_request_id,request_hash,reason_code,evidence_json,status,resolved_at) values(101,102,?,?,?,'HARASSMENT',cast(? as jsonb),?,?) returning report_id",Long.class,UUID.randomUUID(),UUID.randomUUID(),"a".repeat(64),evidence,status,java.sql.Timestamp.from(Instant.now().minus(Duration.ofDays(days))));}
 private boolean exists(long id){return jdbc.queryForObject("select count(*) from user_reports where report_id=?",Long.class,id)==1;}
 private String evidence(String key){return "[{\"storageKey\":\""+key+"\"}]";}
 private String key(){return "media/image/2026/11/"+UUID.randomUUID()+".png";}
 @Test void v33UpgradePreservesExistingReportsAndInitializesHoldSafely(){
  var source=new org.springframework.jdbc.datasource.DriverManagerDataSource(System.getenv("DIO_REPORT_RETENTION_URL"),"postgres",System.getenv("DIO_REPORT_RETENTION_PASSWORD"));
  var admin=new JdbcTemplate(source);String schema="report_hold_qa_"+UUID.randomUUID().toString().replace("-","");
  try{
   admin.execute("create schema "+schema);var properties=new Properties();properties.setProperty("currentSchema",schema);source.setConnectionProperties(properties);
   org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").target("32").load().migrate();
   var local=new JdbcTemplate(source);local.update("insert into users(user_id,nickname,nickname_key) values(701,'a','a'),(702,'b','b')");
   long id=local.queryForObject("insert into user_reports(reporter_user_id,reported_user_id,diary_id,client_request_id,request_hash,reason_code,evidence_json) values(701,702,?,?,?,'HARASSMENT','{}'::jsonb) returning report_id",Long.class,UUID.randomUUID(),UUID.randomUUID(),"a".repeat(64));
   org.flywaydb.core.Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
   assertThat(local.queryForObject("select retention_hold from user_reports where report_id=?",Boolean.class,id)).isFalse();
   assertThat(local.queryForObject("select evidence_json::text from user_reports where report_id=?",String.class,id)).isEqualTo("{}");
   assertThat(local.queryForObject("select count(*) from user_reports",Long.class)).isEqualTo(1);
  }finally{source.setConnectionProperties(new Properties());admin.execute("drop schema if exists "+schema+" cascade");}
 }
 @Test void legalHoldAndIncompleteOrRecentReportsStayAndReleaseAllowsCleanup(){
  String key=key();long held=report(evidence(key),"RESOLVED",31),old=report("[]","DISMISSED",31),recent=report("[]","RESOLVED",29),pending=report("[]","RECEIVED",31);
  assertThatThrownBy(()->jdbc.update("update user_reports set retention_hold=true where report_id=?",held)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  jdbc.update("update user_reports set retention_hold=true,retention_hold_reason='pending dispute',retention_hold_by='qa operator',retention_hold_at=now() where report_id=?",held);
  assertThat(cleanup.queueExpiredReports(Instant.now())).isEqualTo(1);
  assertThat(exists(held)).isTrue();assertThat(exists(recent)).isTrue();assertThat(exists(pending)).isTrue();assertThat(exists(old)).isFalse();
  assertThat(jdbc.queryForObject("select count(*) from report_evidence_deletion_queue",Long.class)).isZero();verifyNoInteractions(files);
  jdbc.update("update user_reports set retention_hold=false,retention_hold_reason=null,retention_hold_by=null,retention_hold_at=null where report_id=?",held);
  assertThat(cleanup.queueExpiredReports(Instant.now())).isEqualTo(1);
  assertThat(exists(held)).isFalse();assertThat(cleanup.retryEvidenceDeletes()).isEqualTo(1);verify(files).delete(key);
 }
 @Test void invalidEvidenceRetainsEntireReportAndRepairReleasesIt(){
  String key=key();long invalid=report("{}","RESOLVED",40),partial=report("[{\"storageKey\":\""+key+"\"},{}]","RESOLVED",40),valid=report("[]","RESOLVED",31);
  assertThat(cleanup.queueExpiredReports(Instant.now())).isEqualTo(1);
  assertThat(exists(invalid)).isTrue();assertThat(exists(partial)).isTrue();assertThat(exists(valid)).isFalse();
  assertThat(jdbc.queryForObject("select count(*) from report_evidence_deletion_queue",Long.class)).isZero();
  jdbc.update("update user_reports set evidence_json=cast(? as jsonb) where report_id=?",evidence(key),partial);
  assertThat(cleanup.queueExpiredReports(Instant.now())).isEqualTo(1);assertThat(exists(invalid)).isTrue();assertThat(exists(partial)).isFalse();
 }
 @Test void storageFailureRetainsDeletionTaskThenRecovers(){
  String key=key();long id=report(evidence(key),"RESOLVED",31);
  assertThat(cleanup.queueExpiredReports(Instant.now())).isEqualTo(1);assertThat(exists(id)).isFalse();
  doThrow(new IllegalStateException("temporary storage failure")).when(files).delete(key);
  assertThat(cleanup.retryEvidenceDeletes()).isZero();
  assertThat(jdbc.queryForObject("select attempt_count from report_evidence_deletion_queue",Integer.class)).isEqualTo(1);
  reset(files);jdbc.update("update report_evidence_deletion_queue set next_attempt_at=now()-interval '1 second'");
  assertThat(cleanup.retryEvidenceDeletes()).isEqualTo(1);verify(files).delete(key);
  assertThat(jdbc.queryForObject("select count(*) from report_evidence_deletion_queue",Long.class)).isZero();
 }
 @Test void queueWriteFailureRollsBackReportDeletion(){
  String key=key();long id=report(evidence(key),"RESOLVED",31);
  jdbc.update("insert into report_evidence_deletion_queue(deletion_id,report_id,storage_key) values(?,?,?)",UUID.randomUUID(),999L,key);
  assertThatThrownBy(()->cleanup.queueExpiredReports(Instant.now())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  assertThat(exists(id)).isTrue();
 }
 @Test void corruptFullPageDoesNotStarveValidLaterReport(){
  for(int i=0;i<100;i++)report("{}","RESOLVED",40);
  long valid=report("[]","RESOLVED",31);
  assertThat(cleanup.queueExpiredReports(Instant.now())).isEqualTo(1);assertThat(exists(valid)).isFalse();
  assertThat(jdbc.queryForObject("select count(*) from user_reports",Long.class)).isEqualTo(100);
 }
}
