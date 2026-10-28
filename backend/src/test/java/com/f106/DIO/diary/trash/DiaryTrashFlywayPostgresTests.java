package com.f106.DIO.diary.trash;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DIO_LIST_QUERY_PG",matches="true")
class DiaryTrashFlywayPostgresTests {
    @Test void fullMigrationSchemaSupportsOwnerTrashAndRestoreWithoutChangingMembership() {
        String url=System.getenv("DB_URL"),user=System.getenv("POSTGRES_USER"),password=System.getenv("POSTGRES_PASSWORD");
        if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_trash_qa")) throw new IllegalStateException("Dedicated loopback dio_trash_qa required");
        var admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));
        String schema="trash_flyway_"+UUID.randomUUID().toString().replace("-","");
        admin.execute("create schema "+schema);
        try {
            var source=new DriverManagerDataSource(url+"?currentSchema="+schema,user,password);
            Flyway.configure().dataSource(source).defaultSchema(schema).load().migrate();
            var jdbc=new JdbcTemplate(source);var tx=new TransactionTemplate(new DataSourceTransactionManager(source));
            jdbc.update("insert into users(user_id,nickname,nickname_key,profile_color,status) values(101,'trash owner','trash owner','#123456','ACTIVE')");
            UUID id=UUID.randomUUID();
            jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,101,'owned')",id);
            jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,101,'OWNER','#123456')",id);
            var identity=org.mockito.Mockito.mock(DiaryRequestIdentity.class);
            org.mockito.Mockito.when(identity.requireUserId(org.mockito.ArgumentMatchers.any())).thenReturn(101L);
            var repo=new DiaryDetailRepository(jdbc);
            var service=new DiaryTrashService(jdbc,identity,repo,new JdbcDiaryMembershipAccess(jdbc,repo),30,Clock.systemUTC());
            tx.executeWithoutResult(s -> service.trash(id));
            var list=tx.execute(s -> service.list(null,20,null));
            assertThat(list.items()).hasSize(1);assertThat(list.items().get(0).canRestore()).isTrue();
            Instant deleted=jdbc.queryForObject("select deleted_at from diaries where diary_id=?",Timestamp.class,id).toInstant();
            tx.executeWithoutResult(s -> service.trash(id));
            assertThat(jdbc.queryForObject("select deleted_at from diaries where diary_id=?",Timestamp.class,id).toInstant()).isEqualTo(deleted);
            tx.execute(s -> service.restore(id));
            assertThat(jdbc.queryForObject("select deleted_at from diaries where diary_id=?",Timestamp.class,id)).isNull();
            assertThat(jdbc.queryForObject("select role from diary_members where diary_id=?",String.class,id)).isEqualTo("OWNER");
            assertThat(jdbc.queryForObject("select left_at from diary_members where diary_id=?",Timestamp.class,id)).isNull();
        } finally {
            if(schema.matches("trash_flyway_[0-9a-f]{32}")) admin.execute("drop schema "+schema+" cascade");
        }
    }
}
