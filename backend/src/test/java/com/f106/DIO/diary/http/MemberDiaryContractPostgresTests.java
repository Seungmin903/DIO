package com.f106.DIO.diary.http;

import java.util.UUID;
import java.util.Map;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.MediaType;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Actual PostgreSQL HTTP contract; only an explicitly disposable database is accepted. */
@EnabledIfEnvironmentVariable(named="DIO_MEMBER_CONTRACT_PG",matches="true")
class MemberDiaryContractPostgresTests extends MemberDiaryHttpTests {
    static JdbcTemplate admin;
    static String schema;
    @Autowired PlatformTransactionManager transactionManager;
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        String url=System.getenv("DB_URL"),user=System.getenv("POSTGRES_USER"),password=System.getenv("POSTGRES_PASSWORD");
        if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_member_contract_qa")) throw new IllegalStateException("Explicit disposable dio_member_contract_qa DB required");
        if(user==null || password==null) throw new IllegalStateException("Explicit test credentials required");
        schema="member_contract_"+UUID.randomUUID().toString().replace("-","");
        admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));admin.execute("create schema "+schema);
        r.add("spring.datasource.url",()->url+"?currentSchema="+schema);
        r.add("spring.datasource.username",()->user);r.add("spring.datasource.password",()->password);
        r.add("spring.jpa.hibernate.ddl-auto",()->"none");r.add("spring.flyway.enabled",()->true);
        r.add("spring.flyway.default-schema",()->schema);r.add("spring.flyway.schemas",()->schema);
    }
    @Test void heldPatchDoesNotSerializeOtherDiariesOfTheSameAccount() throws Exception {
        String a=id(create()),b=id(create()),c=id(create());
        mvc.perform(delete(PATH+"/"+c).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
        try(var held=new HeldPatch(a)) {
            var independent=held.pool.submit(()->{
                mvc.perform(get(PATH+"/"+b).header("Authorization","Bearer "+owner)).andExpect(status().isOk());
                mvc.perform(get(PATH).header("Authorization","Bearer "+owner)).andExpect(status().isOk());
                assertThat(patchStatus(b,"other diary", "1")).isEqualTo(200);
                mvc.perform(delete(PATH+"/"+b).header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
                mvc.perform(post(PATH+"/"+b+"/restore").header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andExpect(jsonPath("$.diary.version").value("4"));
                mvc.perform(delete(PATH+"/"+c+"/purge").header("Authorization","Bearer "+owner)).andExpect(status().isNoContent());
                create();
                return true;
            });
            assertThat(independent.get(10,TimeUnit.SECONDS)).isTrue();
            assertThat(held.release.getCount()).as("unrelated work completed before releasing the PATCH transaction").isEqualTo(1);
            assertThat(held.first.isDone()).isFalse();
        }
    }

    @Test void sameDiaryPatchAndReadStillWaitAndObserveTheCommittedVersion() throws Exception {
        String a=id(create());
        try(var held=new HeldPatch(a)) {
            var patchPid=new CompletableFuture<Integer>();var readPid=new CompletableFuture<Integer>();
            var writer=held.pool.submit(()->{
                var status=new java.util.concurrent.atomic.AtomicInteger();
                try {tx().executeWithoutResult(s->{patchPid.complete(pid());status.set(patchStatus(a,"stale", "1"));});}
                catch(org.springframework.transaction.UnexpectedRollbackException expected) {
                    // The HTTP handler returned 409, but its service also marked this test's outer transaction rollback-only.
                    assertThat(status.get()).isEqualTo(409);
                }
                return status.get();
            });
            blockedBy(held.pid.get(5,TimeUnit.SECONDS),patchPid.get(5,TimeUnit.SECONDS));
            var reader=held.pool.submit(()->tx().execute(s->{readPid.complete(pid());try {
                return json.readTree(mvc.perform(get(PATH+"/"+a).header("Authorization","Bearer "+owner)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()).get("diary").get("version").asString();
            } catch(Exception e){throw new IllegalStateException(e);}}));
            waiting(readPid.get(5,TimeUnit.SECONDS));
            assertThat(writer.isDone()).isFalse();assertThat(reader.isDone()).isFalse();
            held.release.countDown();
            assertThat(writer.get(10,TimeUnit.SECONDS)).isEqualTo(409);
            assertThat(reader.get(10,TimeUnit.SECONDS)).isEqualTo("2");
            assertThat(jdbc.queryForObject("select version from diaries where diary_id=?",Long.class,UUID.fromString(a))).isEqualTo(2);
        }
    }

    @Test void accountDeactivationWaitsForPatchThenPreventsFurtherWrites() throws Exception {
        String a=id(create());
        try(var held=new HeldPatch(a)) {
            var otherPid=new CompletableFuture<Integer>();
            var deactivation=held.pool.submit(()->tx().execute(s->{otherPid.complete(pid());return jdbc.update("update users set status='SUSPENDED' where user_id=101");}));
            blockedBy(held.pid.get(5,TimeUnit.SECONDS),otherPid.get(5,TimeUnit.SECONDS));
            held.release.countDown();assertThat(deactivation.get(10,TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(patchStatus(a,"after suspension", "2")).isEqualTo(401);
            assertThat(jdbc.queryForObject("select version from diaries where diary_id=?",Long.class,UUID.fromString(a))).isEqualTo(2);
        }
    }

    @Test void membershipRevocationWaitsForPatchThenPreventsFurtherWrites() throws Exception {
        String a=id(create());
        try(var held=new HeldPatch(a)) {
            var otherPid=new CompletableFuture<Integer>();
            var revocation=held.pool.submit(()->tx().execute(s->{otherPid.complete(pid());return jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=101",UUID.fromString(a));}));
            blockedBy(held.pid.get(5,TimeUnit.SECONDS),otherPid.get(5,TimeUnit.SECONDS));
            held.release.countDown();assertThat(revocation.get(10,TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(patchStatus(a,"after leaving", "2")).isEqualTo(404);
            assertThat(jdbc.queryForObject("select version from diaries where diary_id=?",Long.class,UUID.fromString(a))).isEqualTo(2);
        }
    }

    private TransactionTemplate tx() {return new TransactionTemplate(transactionManager);}
    private int pid() {return jdbc.queryForObject("select pg_backend_pid()",Integer.class);}
    private int patchStatus(String id,String title,String version) {
        try {return mvc.perform(patch(PATH+"/"+id).header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("diaryTitle",title,"expectedVersion",version)))).andReturn().getResponse().getStatus();}
        catch(Exception e){throw new IllegalStateException(e);}
    }
    private final class HeldPatch implements AutoCloseable {
        final ExecutorService pool=Executors.newFixedThreadPool(3);
        final CountDownLatch held=new CountDownLatch(1),release=new CountDownLatch(1);
        final CompletableFuture<Integer> pid=new CompletableFuture<>();
        final Future<Integer> first;
        HeldPatch(String id) throws Exception {
            first=pool.submit(()->tx().execute(s->{try {
                pid.complete(MemberDiaryContractPostgresTests.this.pid());
                assertThat(patchStatus(id,"held patch", "1")).isEqualTo(200);
                held.countDown();awaitRelease(release);return 200;
            }finally{held.countDown();}}));
            try {
                if(!held.await(15,TimeUnit.SECONDS))throw new AssertionError("PATCH did not reach the held transaction");
                if(first.isDone())first.get(1,TimeUnit.SECONDS);
            } catch(Exception|AssertionError failure) {
                release.countDown();pool.shutdownNow();throw failure;
            }
        }
        public void close() throws Exception {
            release.countDown();try {assertThat(first.get(15,TimeUnit.SECONDS)).isEqualTo(200);}
            finally {pool.shutdown();if(!pool.awaitTermination(15,TimeUnit.SECONDS)){pool.shutdownNow();assertThat(pool.awaitTermination(15,TimeUnit.SECONDS)).isTrue();}}
        }
    }
    private void blockedBy(int blocker,int waiter) {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean blocked=false;
        while(System.nanoTime()<deadline){if(Boolean.TRUE.equals(jdbc.queryForObject("select ?=any(pg_blocking_pids(?))",Boolean.class,blocker,waiter))){blocked=true;break;}java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(20));}
        assertThat(blocked).as("actual PostgreSQL blocker must be observed").isTrue();
    }
    private void waiting(int waiter) {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean blocked=false;
        while(System.nanoTime()<deadline){if(Boolean.TRUE.equals(jdbc.queryForObject("select cardinality(pg_blocking_pids(?))>0",Boolean.class,waiter))){blocked=true;break;}java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(20));}
        assertThat(blocked).as("same-diary read must wait for uncommitted metadata").isTrue();
    }
    private static void awaitRelease(CountDownLatch release) {
        try {if(!release.await(30,TimeUnit.SECONDS))throw new IllegalStateException("PATCH release timed out");}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}
    }
    @AfterAll static void cleanup() { if(admin!=null && schema.matches("member_contract_[0-9a-f]{32}")) admin.execute("drop schema "+schema+" cascade"); }
}
