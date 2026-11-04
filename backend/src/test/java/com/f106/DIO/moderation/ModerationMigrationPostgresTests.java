package com.f106.DIO.moderation;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.flywaydb.core.Flyway;import org.springframework.jdbc.core.JdbcTemplate;import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.util.*;import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="DIO_MODERATION_POSTGRES_TEST",matches="true")
class ModerationMigrationPostgresTests {
 @Test void flywayUpgradesExistingReportTablesAndAllowsMailReservation(){
  String url=System.getenv("DB_URL");if(url==null||!url.startsWith("jdbc:postgresql://127.0.0.1:"))throw new IllegalStateException("Explicit local PostgreSQL URL required");
  var source=new DriverManagerDataSource(url,System.getenv("POSTGRES_USER"),System.getenv("POSTGRES_PASSWORD"));
  var admin=new JdbcTemplate(source);String schema="moderation_qa_"+UUID.randomUUID().toString().replace("-","");
  try{
   admin.execute("create schema "+schema);var properties=new Properties();properties.setProperty("currentSchema",schema);source.setConnectionProperties(properties);
   Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").target("30").load().migrate();
   var jdbc=new JdbcTemplate(source);jdbc.update("insert into users(user_id,nickname,nickname_key) values(101,'a','a'),(102,'b','b')");
   UUID diary=UUID.randomUUID(),key=UUID.randomUUID();
   jdbc.update("insert into user_reports(reporter_user_id,reported_user_id,diary_id,client_request_id,request_hash,reason_code) values(101,102,?,?,?,'HARASSMENT')",diary,key,"a".repeat(64));
   assertThat(jdbc.queryForObject("select evidence_json::text from user_reports",String.class)).isEqualTo("[]");
   // Reproduce the deployed V30 constraint before upgrading; keep the existing report row.
   assertThatThrownBy(()->jdbc.update("update user_reports set notification_status='SENDING'"))
    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
   Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
   assertThat(jdbc.queryForObject("select notification_status from user_reports",String.class)).isEqualTo("PENDING");
   // Reservation, failed delivery, retry and successful delivery must all persist on PostgreSQL.
   for(String state:List.of("SENDING","FAILED","SENDING","SENT")){
    assertThat(jdbc.update("update user_reports set notification_status=?",state)).isEqualTo(1);
    assertThat(jdbc.queryForObject("select notification_status from user_reports",String.class)).isEqualTo(state);
   }
   assertThatThrownBy(()->jdbc.update("update user_reports set notification_status='INVALID'"))
    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
   assertThatThrownBy(()->jdbc.update("insert into user_reports(reporter_user_id,reported_user_id,diary_id,client_request_id,request_hash,reason_code) values(101,102,?,?,?,'HARASSMENT')",diary,key,"a".repeat(64))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
   assertThatThrownBy(()->jdbc.update("insert into user_blocks(blocker_user_id,blocked_user_id) values(101,101)")).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
   jdbc.update("insert into user_blocks(blocker_user_id,blocked_user_id) values(101,102),(102,101)");assertThat(jdbc.queryForObject("select count(*) from user_blocks",Integer.class)).isEqualTo(2);
  }finally{source.setConnectionProperties(new Properties());admin.execute("drop schema if exists "+schema+" cascade");}
 }
}
