package com.f106.DIO.diary.purge;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.*;
import com.f106.DIO.diary.trash.DiaryTrashService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DIO_LIST_QUERY_PG",matches="true")
class DiaryPurgePostgresTests extends DiaryPurgePostgresFixture {
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
        error(404,this::purge);
    }
    @Test void onlyActiveMatchingOwnerMayPurgeAndActiveDiaryIsAConflict() {
        error(404,()->tx.executeWithoutResult(s->service(2).purge(target)));
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
        jdbc.execute("drop table new_module_reference");purge();assertThat(count("diaries")).isEqualTo(2);
    }
    @Test void purgeWaitsForRestoreAndRechecksActiveState() throws Exception {race(false);}
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
}
