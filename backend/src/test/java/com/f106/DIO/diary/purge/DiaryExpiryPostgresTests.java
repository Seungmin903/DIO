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

import com.f106.DIO.diary.expiry.ExpiredDiaryCleanup;

@EnabledIfEnvironmentVariable(named="DIO_LIST_QUERY_PG",matches="true")
class DiaryExpiryPostgresTests extends DiaryPurgePostgresFixture {
    ExpiredDiaryCleanup cleanup(int batch,int timeout) {
        return new ExpiredDiaryCleanup(jdbc,new DiaryDetailRepository(jdbc),tx.getTransactionManager(),Clock.fixed(now,ZoneOffset.UTC),batch,timeout);
    }
    void deleted(UUID id,Instant at) {jdbc.update("update diaries set deleted_at=? where diary_id=?",at==null?null:Timestamp.from(at),id);}
    @Test void exactBoundaryAndOlderAreDeletedButBeforeExpiryActiveAndOwnerlessRemain() {
        var mediaBefore=snapshot("media_files","media_file_id");
        deleted(target,now.minus(Duration.ofDays(30)).minusNanos(1000));
        deleted(archived,now.minus(Duration.ofDays(30)));
        deleted(other,now.minus(Duration.ofDays(30)).plusNanos(1000));
        UUID ownerless=UUID.randomUUID(),active=UUID.randomUUID();diary(ownerless,1,now.minus(Duration.ofDays(100)));diary(active,1,null);
        jdbc.update("update diaries set owner_user_id=null where diary_id=?",ownerless);
        var cleanup=cleanup(20,1000);var result=cleanup.run();
        assertThat(result).isEqualTo(new ExpiredDiaryCleanup.Result(2,2,0,0));
        assertThat(jdbc.queryForList("select diary_id from diaries",UUID.class)).containsExactlyInAnyOrder(other,ownerless,active);
        assertThat(snapshot("media_files","media_file_id")).isEqualTo(mediaBefore);
        assertThat(cleanup.run().examined()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname=? and indexname='diaries_expiry_cleanup_idx'",Long.class,schema)).isEqualTo(1);
    }
    @Test void failedItemRollsBackDoesNotStarveNextPageAndIsRetriedOnWrap() {
        deleted(target,now.minus(Duration.ofDays(40)));deleted(other,now.minus(Duration.ofDays(35)));
        jdbc.execute("create table pending_reference(diary_id uuid references diaries(diary_id))");jdbc.update("insert into pending_reference values(?)",target);
        var cleanup=cleanup(1,1000);
        assertThat(cleanup.run()).isEqualTo(new ExpiredDiaryCleanup.Result(1,0,0,1));
        assertThat(jdbc.queryForObject("select page_id from notifications where notification_id=101",UUID.class)).isEqualTo(page);
        assertThat(jdbc.queryForObject("select response_body::text from diary_creation_receipts where key_hash=?",String.class,key)).contains("private");
        assertThat(cleanup.run()).isEqualTo(new ExpiredDiaryCleanup.Result(1,1,0,0));
        jdbc.execute("drop table pending_reference");
        assertThat(cleanup.run()).isEqualTo(new ExpiredDiaryCleanup.Result(1,1,0,0));
        assertThat(count("diaries")).isEqualTo(1);
    }
    @Test void inactiveAccountAndLeftMembershipDoNotPreventServerExpiryCleanup() {
        deleted(target,now.minus(Duration.ofDays(31)));
        jdbc.update("update users set status='SUSPENDED' where user_id=1");
        jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=1",target);
        assertThat(cleanup(20,1000).run().deleted()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from users where user_id=1",String.class)).isEqualTo("SUSPENDED");
    }
    @Test void restoreStartedBeforeExpiryWinsAndBatchRechecksAfterLock() throws Exception {changedBeforeLock(true);}
    @Test void reTrashedItemWithNewDeletionTimeIsNotDeletedFromOldCandidate() throws Exception {changedBeforeLock(false);}
    void changedBeforeLock(boolean restore) throws Exception {
        deleted(target,now.minus(Duration.ofDays(30)));
        var pool=Executors.newFixedThreadPool(2);var held=new CountDownLatch(1);var release=new CountDownLatch(1);var blocker=new CompletableFuture<Integer>();
        try {
            var first=pool.submit(()->tx.execute(s->{blocker.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));
                if(restore) {var repo=new DiaryDetailRepository(jdbc);new DiaryTrashService(jdbc,identity(1),repo,new JdbcDiaryMembershipAccess(jdbc,repo),Clock.fixed(now.minusNanos(1000),ZoneOffset.UTC), org.mockito.Mockito.mock(com.f106.DIO.inventory.InventoryLimits.class)).restore(target);}
                else jdbc.update("update diaries set deleted_at=? where diary_id=?",Timestamp.from(now),target);
                held.countDown();await(release);return true;}));
            assertThat(held.await(10,TimeUnit.SECONDS)).isTrue();
            var batch=pool.submit(()->cleanup(20,5000).run());
            waitingPid(blocker.get(5,TimeUnit.SECONDS));release.countDown();assertThat(first.get(10,TimeUnit.SECONDS)).isTrue();
            assertThat(batch.get(10,TimeUnit.SECONDS)).isEqualTo(new ExpiredDiaryCleanup.Result(1,0,1,0));
            assertThat(jdbc.queryForObject("select count(*) from diaries where diary_id=?",Long.class,target)).isEqualTo(1);
        } finally {release.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(15,TimeUnit.SECONDS)).isTrue();}
    }
    @Test void batchDeletionWinsAndWaitingRestoreCannotResurrectIt() throws Exception {
        deleted(target,now.minus(Duration.ofDays(30)));
        var pool=Executors.newFixedThreadPool(3);var held=new CountDownLatch(1);var release=new CountDownLatch(1);var blocker=new CompletableFuture<Integer>();var restorePid=new CompletableFuture<Integer>();
        try {
            var child=pool.submit(()->tx.execute(s->{blocker.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));jdbc.queryForList("select page_id from pages where page_id=? for update",UUID.class,page);held.countDown();await(release);return true;}));
            assertThat(held.await(10,TimeUnit.SECONDS)).isTrue();
            var batch=pool.submit(()->cleanup(20,5000).run());int batchPid=waitingPid(blocker.get(5,TimeUnit.SECONDS));
            var restore=pool.submit(()->tx.execute(s->{restorePid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));try {var repo=new DiaryDetailRepository(jdbc);new DiaryTrashService(jdbc,identity(1),repo,new JdbcDiaryMembershipAccess(jdbc,repo),Clock.fixed(now.minusNanos(1000),ZoneOffset.UTC), org.mockito.Mockito.mock(com.f106.DIO.inventory.InventoryLimits.class)).restore(target);return 0;}catch(DiaryDetailException e){return e.status().value();}}));
            blocked(batchPid,restorePid.get(5,TimeUnit.SECONDS));release.countDown();assertThat(child.get(10,TimeUnit.SECONDS)).isTrue();
            assertThat(batch.get(10,TimeUnit.SECONDS).deleted()).isEqualTo(1);assertThat(restore.get(10,TimeUnit.SECONDS)).isEqualTo(404);
        } finally {release.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(15,TimeUnit.SECONDS)).isTrue();}
    }
    @Test void lockTimeoutRollsBackAndTheNextRunCanRetry() throws Exception {
        deleted(target,now.minus(Duration.ofDays(31)));
        var pool=Executors.newSingleThreadExecutor();var held=new CountDownLatch(1);var release=new CountDownLatch(1);
        try {
            var locked=pool.submit(()->tx.execute(s->{jdbc.queryForList("select page_id from pages where page_id=? for update",UUID.class,page);held.countDown();await(release);return true;}));
            assertThat(held.await(10,TimeUnit.SECONDS)).isTrue();var cleanup=cleanup(20,100);
            assertThat(cleanup.run()).isEqualTo(new ExpiredDiaryCleanup.Result(1,0,0,1));
            assertThat(jdbc.queryForObject("select response_body::text from diary_creation_receipts where key_hash=?",String.class,key)).contains("private");
            release.countDown();assertThat(locked.get(10,TimeUnit.SECONDS)).isTrue();assertThat(cleanup.run().deleted()).isEqualTo(1);
        } finally {release.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(15,TimeUnit.SECONDS)).isTrue();}
    }
    @Test void twoIndependentWorkersNeverDeleteTheSameGraphTwice() throws Exception {
        deleted(target,now.minus(Duration.ofDays(31)));var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try {
            var one=pool.submit(()->{await(start);return cleanup(20,5000).run();});var two=pool.submit(()->{await(start);return cleanup(20,5000).run();});start.countDown();
            var a=one.get(15,TimeUnit.SECONDS);var b=two.get(15,TimeUnit.SECONDS);assertThat(a.deleted()+b.deleted()).isEqualTo(1);assertThat(a.failed()+b.failed()).isZero();
            assertThat(jdbc.queryForObject("select count(*) from diaries where diary_id=?",Long.class,target)).isZero();
        } finally {pool.shutdownNow();assertThat(pool.awaitTermination(15,TimeUnit.SECONDS)).isTrue();}
    }
    int waitingPid(int blocker) {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);
        while(System.nanoTime()<deadline) {var rows=jdbc.queryForList("select pid from pg_stat_activity where ?=any(pg_blocking_pids(pid))",Integer.class,blocker);if(!rows.isEmpty())return rows.get(0);java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(20));}
        throw new AssertionError("PostgreSQL waiting transaction not observed");
    }
}
