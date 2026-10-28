package com.f106.DIO.diary;

import java.sql.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.*;
import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfSystemProperty(named="dio.postgres-test",matches="true")
@EnabledIfEnvironmentVariable(named="DIO_DIARY_CREATE_PG_QA",matches="true")
class PostgresDiaryVersionMigrationTests {
    @Test void upgradesExistingDiaryAndCreationReceiptWithoutReplacingTheirContents() throws Exception {
        String url=System.getenv("DB_URL"),user=System.getenv("POSTGRES_USER"),password=System.getenv("POSTGRES_PASSWORD");
        String schema="qa_diary_version_"+UUID.randomUUID().toString().replace("-","");
        try(var connection=DriverManager.getConnection(url,user,password);var sql=connection.createStatement()) {
            try(var rows=sql.executeQuery("select current_database()")){rows.next();assertThat(rows.getString(1)).isEqualTo("dio_diary_create_qa");}
            try {
                Flyway.configure().dataSource(url,user,password).schemas(schema).defaultSchema(schema).target("9").load().migrate();
                sql.execute("set search_path to "+schema);
                sql.execute("insert into users(user_id,nickname,nickname_key) values(1,'QA','qa')");
                String id=UUID.randomUUID().toString();
                sql.execute("insert into diaries(diary_id,owner_user_id,title) values('"+id+"',1,'Existing')");
                sql.execute("insert into diary_creation_requests values(1,'"+UUID.randomUUID()+"','"+"a".repeat(64)+"','"+id+"','{\"diary\":{\"diaryTitle\":\"Original snapshot\"},\"firstPageId\":\"kept\"}',current_timestamp,current_timestamp+interval '24 hours')");
                Flyway.configure().dataSource(url,user,password).schemas(schema).defaultSchema(schema).load().migrate();
                try(var rows=sql.executeQuery("select version,title from diaries")){rows.next();assertThat(rows.getLong(1)).isEqualTo(1);assertThat(rows.getString(2)).isEqualTo("Existing");}
                try(var rows=sql.executeQuery("select response_body::jsonb #>> '{diary,version}',response_body::jsonb #>> '{diary,diaryTitle}',response_body::jsonb ->> 'firstPageId',request_hash from diary_creation_requests")){
                    rows.next();assertThat(rows.getString(1)).isEqualTo("1");assertThat(rows.getString(2)).isEqualTo("Original snapshot");assertThat(rows.getString(3)).isEqualTo("kept");assertThat(rows.getString(4)).isEqualTo("a".repeat(64));
                }
            }finally{sql.execute("set search_path to public");sql.execute("drop schema if exists "+schema+" cascade");}
        }
    }
}
