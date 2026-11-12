package com.f106.DIO.diary.purge;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.*;
import com.f106.DIO.diary.trash.DiaryTrashService;
import com.f106.DIO.support.MigratedPostgresSchema;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DIO_LIST_QUERY_PG",matches="true")
class DiaryPurgePostgresTests {
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
        // 마이그레이션은 JVM당 한 번만 하고, 테스트마다 데이터만 마이그레이션 직후 상태로 되돌린다.
        schema=MigratedPostgresSchema.reset(url,user,password,"purge_qa_");
        var source=new DriverManagerDataSource(url+"?currentSchema="+schema,user,password);
        jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
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
            jdbc.update("insert into diary_invites(diary_id,inviter_user_id,invite_type,token_hash,expires_at,retention_until) values(?,1,'LINK',?,?,?)",d,new byte[32],inviteExpiry,inviteExpiry);
            jdbc.update("insert into diary_media_library(diary_id,media_file_id,added_by_user_id,library_category) values(?,?,1,'STICKER')",d,shared);
            jdbc.update("insert into diary_handwriting_fonts(diary_id,font_media_file_id,granted_by_user_id) values(?,?,1)",d,font);
        }
        jdbc.update("insert into ai_jobs(source_media_file_id,result_media_file_id,status) values(?,?,'PROCESSING')",shared,derived);
        notice(101,target,page);notice(102,other,deletedPage);notice(103,other,otherPage);
        jdbc.update("insert into diary_creation_receipts(user_id,key_hash,request_hash,diary_id,response_body,completed_at) values(1,?,?,?,'{\"title\":\"private\"}',?)",key,request,target,Timestamp.from(now));
        service=service(1);var repo=new DiaryDetailRepository(jdbc);trash=new DiaryTrashService(jdbc,identity(1),repo,new JdbcDiaryMembershipAccess(jdbc,repo),Clock.fixed(now,ZoneOffset.UTC), org.mockito.Mockito.mock(com.f106.DIO.inventory.InventoryLimits.class));
    }
    // 다음 테스트의 reset이 데이터를 비우므로 스키마를 지우지 않는다.
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

    @Test void removesEntireGraphButPreservesOtherDiariesMediaAndKeyTombstone() {
        var mediaBefore=snapshot("media_files","media_file_id");
        var jobsBefore=snapshot("ai_jobs","ai_job_id");
        var catalogBefore=snapshot("page_templates","template_id");
        purge();
        assertThat(snapshot("media_files","media_file_id")).isEqualTo(mediaBefore);
        assertThat(snapshot("ai_jobs","ai_job_id")).isEqualTo(jobsBefore);
        assertThat(snapshot("page_templates","template_id")).isEqualTo(catalogBefore);
        assertThat(jdbc.queryForObject("select count(*) from diaries where diary_id=?",Long.class,target)).isZero();
        assertThat(count("diaries")).isEqualTo(2);assertThat(count("pages")).isEqualTo(2);assertThat(count("canvas_elements")).isEqualTo(1);assertThat(count("element_strokes")).isZero();
        assertThat(count("canvas_history_operations")).isEqualTo(2);assertThat(count("diary_members")).isEqualTo(2);assertThat(count("diary_invites")).isEqualTo(2);
        assertThat(count("diary_media_library")).isEqualTo(2);assertThat(count("diary_handwriting_fonts")).isEqualTo(2);
        assertThat(count("media_files")).isEqualTo(4);assertThat(count("ai_jobs")).isEqualTo(1);assertThat(count("users")).isEqualTo(2);
        assertThat(jdbc.queryForObject("select last_opened_page_id from diary_members where diary_id=?",UUID.class,other)).isNull();
        assertThat(jdbc.queryForObject("select last_opened_page_id from diary_members where diary_id=?",UUID.class,archived)).isEqualTo(archivePage);
        assertThat(count("notifications")).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from notifications where notification_id in (101,102) and diary_id is null and page_id is null and payload_json is null",Long.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select page_id from notifications where notification_id=103",UUID.class)).isEqualTo(otherPage);
        assertThat(jdbc.queryForObject("select payload_json::text from notifications where notification_id=103",String.class)).contains("private");
        var receipt=jdbc.queryForMap("select * from diary_creation_receipts where user_id=1 and key_hash=?",key);
        assertThat(receipt.get("diary_id")).isNull();assertThat(receipt.get("response_body")).isNull();assertThat(receipt.get("request_hash").toString()).isEqualTo(request);assertThat(receipt.get("completed_at")).isNotNull();
        var completed=snapshot("diary_purge_receipts","diary_id");purge();
        assertThat(snapshot("diary_purge_receipts","diary_id")).isEqualTo(completed);
        error(404,()->tx.executeWithoutResult(s->service(2).purge(target)));
    }
    @Test void onlyActiveMatchingOwnerMayPurgeAndActiveDiaryIsAConflict() {
        error(403,()->tx.executeWithoutResult(s->service(2).purge(target)));
        error(404,()->tx.executeWithoutResult(s->service.purge(UUID.randomUUID())));
        for(String role:List.of("VIEWER","EDITOR","UNKNOWN")) {jdbc.update("update diary_members set role=? where diary_id=? and user_id=1",role,target);error(404,this::purge);}
        jdbc.update("update diary_members set role='OWNER',left_at=current_timestamp where diary_id=? and user_id=1",target);error(404,this::purge);
        jdbc.update("update diary_members set left_at=null where diary_id=? and user_id=1",target);
        jdbc.update("update diaries set deleted_at=null where diary_id=?",target);error(409,this::purge);
        jdbc.update("update users set status='SUSPENDED' where user_id=1");error(401,this::purge);
        assertThat(count("pages")).isEqualTo(4);
    }
    @Test void anyLateFkFailureRollsBackAllReferenceChangesAndRetrySucceeds() {
        jdbc.execute("create table new_module_reference(diary_id uuid references diaries(diary_id))");jdbc.update("insert into new_module_reference values(?)",target);
        assertThatThrownBy(this::purge).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(count("pages")).isEqualTo(4);assertThat(count("element_strokes")).isEqualTo(1);assertThat(count("canvas_history_operations")).isEqualTo(3);
        assertThat(jdbc.queryForObject("select page_id from notifications where notification_id=101",UUID.class)).isEqualTo(page);
        assertThat(jdbc.queryForObject("select last_opened_page_id from diary_members where diary_id=? and user_id=2",UUID.class,other)).isEqualTo(page);
        assertThat(jdbc.queryForObject("select response_body::text from diary_creation_receipts where key_hash=?",String.class,key)).contains("private");
        assertThat(count("diary_purge_receipts")).isZero();
        jdbc.execute("drop table new_module_reference");purge();assertThat(count("diaries")).isEqualTo(2);
    }
    @Test void purgeWaitsForRestoreAndRechecksActiveState() throws Exception {race(false);}
    @Test void concurrentSameOwnerPurgeCompletesOnceAndReturnsSuccessToBoth() throws Exception {
        var pool=Executors.newFixedThreadPool(2);var held=new CountDownLatch(1);var release=new CountDownLatch(1);
        var firstPid=new CompletableFuture<Integer>();var secondPid=new CompletableFuture<Integer>();
        try {
            var first=pool.submit(()->tx.execute(s->{firstPid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));service.purge(target);held.countDown();await(release);return true;}));
            assertThat(held.await(10,TimeUnit.SECONDS)).isTrue();
            var second=pool.submit(()->tx.execute(s->{secondPid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));service.purge(target);return true;}));
            blocked(firstPid.get(5,TimeUnit.SECONDS),secondPid.get(5,TimeUnit.SECONDS));release.countDown();
            assertThat(first.get(10,TimeUnit.SECONDS)).isTrue();assertThat(second.get(10,TimeUnit.SECONDS)).isTrue();
            assertThat(count("diary_purge_receipts")).isEqualTo(1);
        } finally {release.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(15,TimeUnit.SECONDS)).isTrue();}
    }
    @Test void restoreWaitsForPurgeAndCannotResurrectMissingDiary() throws Exception {race(true);}
    void race(boolean purgeFirst) throws Exception {
        var pool=Executors.newFixedThreadPool(2);var held=new CountDownLatch(1);var release=new CountDownLatch(1);
        var firstPid=new CompletableFuture<Integer>();var secondPid=new CompletableFuture<Integer>();
        try {
            var first=pool.submit(()->tx.execute(s->{firstPid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));if(purgeFirst)service.purge(target);else trash.restore(target);held.countDown();await(release);return true;}));
            assertThat(held.await(10,TimeUnit.SECONDS)).isTrue();
            var second=pool.submit(()->tx.execute(s->{secondPid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));try {if(purgeFirst)trash.restore(target);else service.purge(target);return 0;}catch(DiaryDetailException e){return e.status().value();}}));
            blocked(firstPid.get(5,TimeUnit.SECONDS),secondPid.get(5,TimeUnit.SECONDS));release.countDown();assertThat(first.get(10,TimeUnit.SECONDS)).isTrue();assertThat(second.get(10,TimeUnit.SECONDS)).isEqualTo(purgeFirst?404:409);
        } finally {release.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(15,TimeUnit.SECONDS)).isTrue();}
    }
    @Test void creationReplayReceiptLockCanAcquireDiaryBeforeWaitingPurge() throws Exception {
        var pool=Executors.newFixedThreadPool(2);var held=new CountDownLatch(1);var release=new CountDownLatch(1);
        var firstPid=new CompletableFuture<Integer>();var secondPid=new CompletableFuture<Integer>();
        try {
            var replay=pool.submit(()->tx.execute(s->{firstPid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));jdbc.queryForList("select key_hash from diary_creation_receipts where key_hash=? for update",String.class,key);held.countDown();await(release);return jdbc.queryForObject("select diary_id from diaries where diary_id=? for update",UUID.class,target);}));
            assertThat(held.await(10,TimeUnit.SECONDS)).isTrue();
            var deleting=pool.submit(()->tx.execute(s->{secondPid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));service.purge(target);return true;}));
            blocked(firstPid.get(5,TimeUnit.SECONDS),secondPid.get(5,TimeUnit.SECONDS));release.countDown();assertThat(replay.get(10,TimeUnit.SECONDS)).isEqualTo(target);assertThat(deleting.get(10,TimeUnit.SECONDS)).isTrue();
        } finally {release.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(15,TimeUnit.SECONDS)).isTrue();}
    }
    void blocked(int blocker,int waiter) {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean found=false;
        while(System.nanoTime()<deadline) {if(Boolean.TRUE.equals(jdbc.queryForObject("select ?=any(pg_blocking_pids(?))",Boolean.class,blocker,waiter))){found=true;break;}java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(20));}
        assertThat(found).as("actual PostgreSQL blocker must be observed").isTrue();
    }
    void await(CountDownLatch value) {try {if(!value.await(10,TimeUnit.SECONDS))throw new IllegalStateException("QA release timeout");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}}
}
