package com.f106.DIO.sharing;

import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Opt-in only, disposable loopback database; executes the same service/HTTP/race contract after real Flyway. */
@EnabledIfEnvironmentVariable(named="DIO_INVENTORY_POSTGRES_QA",matches="true")
class InventoryPolicyPostgresTests extends InventoryPolicyTests {
    @org.springframework.beans.factory.annotation.Autowired com.f106.DIO.media.repository.MediaFileRepository mediaFiles;
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){
        String url=System.getenv("DIO_INVENTORY_POSTGRES_URL");
        if(url==null||!url.matches("jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/dio_inventory_qa"))
            throw new IllegalStateException("Disposable loopback dio_inventory_qa required; no fallback");
        registry.add("spring.datasource.url",()->url);
        registry.add("spring.datasource.username",()->"postgres");
        registry.add("spring.datasource.password",()->System.getenv("DIO_INVENTORY_POSTGRES_PASSWORD"));
        registry.add("spring.jpa.hibernate.ddl-auto",()->"validate");
        registry.add("spring.flyway.enabled",()->"true");
    }
    @org.junit.jupiter.api.Test void trashAndRestoreWaitForAccountBeforeLockingDiary()throws Exception {
        var owner=actor();var book=create(owner);
        assertAccountPrecedesDiary(owner.id(),book,()->{
            try {mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/member/diaries/"+book)
                .header("Authorization","Bearer "+owner.token())).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNoContent());}
            catch(Exception e){throw new RuntimeException(e);}
        });
        assertAccountPrecedesDiary(owner.id(),book,()->{
            try {mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/member/diaries/"+book+"/restore")
                .header("Authorization","Bearer "+owner.token())).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());}
            catch(Exception e){throw new RuntimeException(e);}
        });
    }
    @org.junit.jupiter.api.Test void inviteAcceptanceWaitsForAccountBeforeLockingDiary()throws Exception {
        var owner=actor();var book=diary(owner);var token=links.create(book,owner.id()).token();var recipient=actor();
        assertAccountPrecedesDiary(recipient.id(),book,()->links.accept(token,recipient.id()));
    }
    private void assertAccountPrecedesDiary(long user,java.util.UUID book,Runnable operation)throws Exception {
        var pool=java.util.concurrent.Executors.newSingleThreadExecutor();
        var pid=new java.util.concurrent.CompletableFuture<Integer>();
        var pending=new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<?>>();
        try {
            tx().executeWithoutResult(status->{
                jdbc.queryForList("select user_id from users where user_id=? for update",user);
                pending.set(pool.submit(()->tx().executeWithoutResult(worker->{
                    jdbc.execute("set local lock_timeout='8s'");
                    pid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));
                    operation.run();
                })));
                try {
                    int workerPid=pid.get(5,java.util.concurrent.TimeUnit.SECONDS);
                    long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
                    while(!Boolean.TRUE.equals(jdbc.queryForObject("select pg_backend_pid()=any(pg_blocking_pids(?))",Boolean.class,workerPid))){
                        if(System.nanoTime()>deadline)throw new AssertionError("Worker did not wait on the account lock");
                        Thread.sleep(20);
                    }
                    // Models withdrawal's next lock: no diary may be held by an account waiter.
                    jdbc.queryForList("select diary_id from diaries where diary_id=? for update nowait",book);
                }catch(Exception e){throw new RuntimeException(e);}
            });
            pending.get().get(10,java.util.concurrent.TimeUnit.SECONDS);
        }finally{pool.shutdownNow();}
    }

    @org.junit.jupiter.api.Test void hiddenPhotoCleanupPreservesReferencedOriginalUntilReferenceIsRemoved(){
        var user=actor();var book=diary(user);var image=media(user,"PHOTO");
        jdbc.update("update media_files set library_removed_at=current_timestamp-interval '31 days' where media_file_id=?",image);
        jdbc.update("update diaries set cover_json=? where diary_id=?","{\"kind\":\"photo\",\"photo\":{\"mediaFileId\":\""+image+"\"}}",book);
        var cutoff=java.time.Instant.now().minus(java.time.Duration.ofDays(30));
        org.assertj.core.api.Assertions.assertThat(mediaFiles.deletePhysicallyIfDeletable(image,cutoff)).isZero();
        jdbc.update("update diaries set cover_json=null where diary_id=?",book);
        org.assertj.core.api.Assertions.assertThat(mediaFiles.findPhysicallyDeletable(cutoff,org.springframework.data.domain.PageRequest.of(0,1000)))
            .extracting(com.f106.DIO.media.domain.MediaFile::getMediaFileId).contains(image);
        org.assertj.core.api.Assertions.assertThat(mediaFiles.deletePhysicallyIfDeletable(image,cutoff)).isEqualTo(1);
    }
}
