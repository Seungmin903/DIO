package com.f106.DIO.diary.purge;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.*;
import com.f106.DIO.diary.trash.DiaryTrashService;
import com.f106.DIO.support.MigratedPostgresSchema;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DIO_LIST_QUERY_PG",matches="true")
abstract class DiaryPurgePostgresFixture {
    JdbcTemplate jdbc,admin; TransactionTemplate tx; String schema;
    DiaryPurgeService service; DiaryTrashService trash;
    final UUID target=UUID.randomUUID(),other=UUID.randomUUID(),archived=UUID.randomUUID();
    final UUID page=UUID.randomUUID(),deletedPage=UUID.randomUUID(),otherPage=UUID.randomUUID(),archivePage=UUID.randomUUID();
    final UUID element=UUID.randomUUID(),stroke=UUID.randomUUID(),otherElement=UUID.randomUUID();
    final UUID shared=UUID.randomUUID(),font=UUID.randomUUID(),privateMedia=UUID.randomUUID(),derived=UUID.randomUUID();
    final String key="a".repeat(64),request="b".repeat(64);
    final Instant now=Instant.parse("2026-10-27T00:00:00Z");
    DiaryRequestIdentity identity(long user) {
        var value=org.mockito.Mockito.mock(DiaryRequestIdentity.class);
        org.mockito.Mockito.when(value.requireUserId(org.mockito.ArgumentMatchers.any())).thenReturn(user);return value;
    }
    DiaryPurgeService service(long user) {var repo=new DiaryDetailRepository(jdbc);return new DiaryPurgeService(jdbc,identity(user),repo,new JdbcDiaryMembershipAccess(jdbc,repo));}
    @BeforeEach void setup() {
        String url=System.getenv("DB_URL"),user=System.getenv("POSTGRES_USER"),password=System.getenv("POSTGRES_PASSWORD");
        if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_trash_qa")) throw new IllegalStateException("Dedicated loopback dio_trash_qa required");
        admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));
        // 마이그레이션을 직접 검증하는 하위 클래스만 새 스키마를 만든다. 나머지는 JVM당 한 번 마이그레이션한 스키마의 데이터만 되돌려 쓴다.
        if(migratesItself()) {schema="purge_qa_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);}
        else schema=MigratedPostgresSchema.reset(url,user,password,"purge_qa_");
        var source=new DriverManagerDataSource(url+"?currentSchema="+schema,user,password);
        jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        if(migratesItself()) migrate(source);
        for(long id:List.of(1L,2L)) jdbc.update("insert into users(user_id,nickname,nickname_key) values(?,?,?)",id,"member"+id,"member"+id);
        diary(target,1,now.minusSeconds(86400));diary(other,2,null);diary(archived,1,now.minusSeconds(2*86400));
        page(page,target,null);page(deletedPage,target,now);page(otherPage,other,null);page(archivePage,archived,now);
        media(shared,"IMAGE",null);media(font,"FONT",null);media(privateMedia,"IMAGE",null);media(derived,"IMAGE",shared);
        canvas(element,page,shared);canvas(stroke,deletedPage,privateMedia);canvas(otherElement,otherPage,shared);
        jdbc.update("insert into element_strokes(element_id,tool,color,stroke_width,base_width,base_height,points) values(?,'PEN','#123456',1,100,100,'[]')",stroke);
        for(UUID p:List.of(page,otherPage,archivePage)) jdbc.update("insert into canvas_history_operations(page_id,actor_user_id,client_operation_id,operation_type,before_state_json,after_state_json) values(?,1,?,'CREATE',cast(? as jsonb),'[]')",p,UUID.randomUUID(),"{\"font\":\""+font+"\"}");
        jdbc.update("update pages set template_config=cast(? as jsonb) where page_id=?","{\"unknownMediaReference\":\""+privateMedia+"\"}",archivePage);
        member(target,1,"OWNER",page);member(target,2,"EDITOR",deletedPage);member(other,2,"OWNER",page);member(archived,1,"OWNER",archivePage);
        for(UUID d:List.of(target,other,archived)) {
            var inviteExpiry=Timestamp.from(now.plusSeconds(86400));
            // 마이그레이션 검증은 V28 이전 스키마에서 픽스처를 넣으므로 retention_until 열이 아직 없다.
            if(migratesItself()) jdbc.update("insert into diary_invites(diary_id,inviter_user_id,invite_type,token_hash,expires_at) values(?,1,'LINK',?,?)",d,new byte[32],inviteExpiry);
            else jdbc.update("insert into diary_invites(diary_id,inviter_user_id,invite_type,token_hash,expires_at,retention_until) values(?,1,'LINK',?,?,?)",d,new byte[32],inviteExpiry,inviteExpiry);
            jdbc.update("insert into diary_media_library(diary_id,media_file_id,added_by_user_id,library_category) values(?,?,1,'STICKER')",d,shared);
            jdbc.update("insert into diary_handwriting_fonts(diary_id,font_media_file_id,granted_by_user_id) values(?,?,1)",d,font);
        }
        jdbc.update("insert into ai_jobs(source_media_file_id,result_media_file_id,status) values(?,?,'PROCESSING')",shared,derived);
        notice(101,target,page);notice(102,other,deletedPage);notice(103,other,otherPage);
        jdbc.update("insert into diary_creation_receipts(user_id,key_hash,request_hash,diary_id,response_body,completed_at) values(1,?,?,?,'{\"title\":\"private\"}',?)",key,request,target,Timestamp.from(now));
        service=service(1);var repo=new DiaryDetailRepository(jdbc);trash=com.f106.DIO.inventory.InventoryTestSupport.withQuotaMock(new DiaryTrashService(jdbc,identity(1),repo,new JdbcDiaryMembershipAccess(jdbc,repo),Clock.fixed(now,ZoneOffset.UTC)));
    }
    /** true면 setup이 빈 스키마를 만들고 {@link #migrate}로 직접 마이그레이션한다. */
    boolean migratesItself() {return false;}
    void migrate(DriverManagerDataSource source) {Flyway.configure().dataSource(source).defaultSchema(schema).load().migrate();}
    @AfterEach void cleanup() {if(migratesItself() && schema!=null && schema.matches("purge_qa_[0-9a-f]{32}")) admin.execute("drop schema "+schema+" cascade");}
    void diary(UUID id,long owner,Instant deleted) {jdbc.update("insert into diaries(diary_id,owner_user_id,title,deleted_at) values(?,?,'owned',?)",id,owner,deleted==null?null:Timestamp.from(deleted));}
    void page(UUID id,UUID diary,Instant deleted) {jdbc.update("insert into pages(page_id,diary_id,sort_key,deleted_at) values(?,?,1,?)",id,diary,deleted==null?null:Timestamp.from(deleted));}
    void media(UUID id,String type,UUID source) {jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,storage_key,mime_type,file_size,status,source_media_file_id) values(?,1,?,?,'application/octet-stream',1,'READY',?)",id,type,"test/"+id,source);}
    void canvas(UUID id,UUID p,UUID media) {jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,media_file_id,properties_json) values(?,?,'PHOTO',1,0,0,100,100,?,'{\"unknown\":true}')",id,p,media);}
    void member(UUID d,long user,String role,UUID last) {jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,last_opened_page_id) values(?,?,?,'#123456',?)",d,user,role,last);}
    void notice(long id,UUID d,UUID p) {jdbc.update("insert into notifications(notification_id,user_id,diary_id,page_id,notification_type,payload_json) values(?,2,?,?,'DIARY_INVITED','{\"private\":true}')",id,d,p);}
    void purge() {tx.executeWithoutResult(s->service.purge(target));}
    void error(int status,Runnable work) {assertThatThrownBy(work::run).isInstanceOfSatisfying(DiaryDetailException.class,e->assertThat(e.status().value()).isEqualTo(status));}
    List<String> snapshot(String table,String order) {return jdbc.queryForList("select row_to_json(t)::text from "+table+" t order by "+order,String.class);}
    long count(String table) {return jdbc.queryForObject("select count(*) from "+table,Long.class);}

    void blocked(int blocker,int waiter) {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean found=false;
        while(System.nanoTime()<deadline) {if(Boolean.TRUE.equals(jdbc.queryForObject("select ?=any(pg_blocking_pids(?))",Boolean.class,blocker,waiter))){found=true;break;}java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(20));}
        assertThat(found).as("actual PostgreSQL blocker must be observed").isTrue();
    }
    void await(CountDownLatch value) {try {if(!value.await(10,TimeUnit.SECONDS))throw new IllegalStateException("QA release timeout");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}}
}
