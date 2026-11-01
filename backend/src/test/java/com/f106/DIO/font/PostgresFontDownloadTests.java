package com.f106.DIO.font;

import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.*;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Opt-in only: never reads DB_URL or connects to a shared QA database. */
@EnabledIfEnvironmentVariable(named="DIO_FONT348_POSTGRES",matches="true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresFontDownloadTests {
    JdbcTemplate admin,jdbc; TransactionTemplate tx; String schema;
    FontService service; AtomicLong actor=new AtomicLong(),sequence=new AtomicLong(100);
    UUID diary,file; long owner,editor;
    static final byte[] CONTENT={0,1,0,0,0,0,0,0,0,0,0,0};
    java.util.function.Supplier<byte[]> readBytes=()->CONTENT;
    final List<Map<String,Object>> evidence=new ArrayList<>();

    @BeforeAll void isolatedDatabase() {
        String url=System.getenv("DIO_FONT348_PG_URL"),user=System.getenv("DIO_FONT348_PG_USER"),marker=System.getenv("DIO_FONT348_PG_NONCE"),directory=System.getenv("DIO_FONT348_PG_DATA");
        if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_font348_isolated") || !"font348".equals(user)
            || marker==null || !marker.matches("[0-9a-f]{32}") || directory==null)throw new IllegalStateException("Explicit dedicated font348 cluster and marker required; no fallback");
        admin=new JdbcTemplate(new DriverManagerDataSource(url,user,""));
        assertThat(admin.queryForObject("select current_database()",String.class)).isEqualTo("dio_font348_isolated");
        assertThat(admin.queryForObject("select current_user",String.class)).isEqualTo("font348");
        assertThat(admin.queryForObject("select token from public.font348_isolation_marker",String.class)).isEqualTo(marker);
        assertThat(Path.of(admin.queryForObject("show data_directory",String.class)).toAbsolutePath().normalize()).isEqualTo(Path.of(directory).toAbsolutePath().normalize());
        schema="font348_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);
        var ds=new DriverManagerDataSource(url,user,"");var properties=new Properties();properties.setProperty("currentSchema",schema);properties.setProperty("ApplicationName","font348-isolated-regression");ds.setConnectionProperties(properties);
        jdbc=new JdbcTemplate(ds);jdbc.setQueryTimeout(10);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));tx.setTimeout(15);
        String expected=System.getenv().getOrDefault("DIO_FONT348_PG_VERSION","14");
        if(!List.of("14","15").contains(expected))throw new IllegalStateException("Only explicit V14 baseline or MR V15 upgrade supported");
        Flyway.configure().dataSource(ds).defaultSchema(schema).target("14").load().migrate();
        if(expected.equals("15"))Flyway.configure().dataSource(ds).defaultSchema(schema).load().migrate();
        assertThat(jdbc.queryForObject("select max(version::integer) from flyway_schema_history where success",Integer.class)).isEqualTo(Integer.valueOf(expected));
        assertThat(jdbc.queryForObject("show transaction_isolation",String.class)).isEqualTo("read committed");
        var identity=mock(DiaryRequestIdentity.class);when(identity.requireUserId(any())).thenAnswer(invocation->actor.get());
        var repository=new DiaryDetailRepository(jdbc);
        service=new FontService(jdbc,identity,repository,new JdbcDiaryMembershipAccess(jdbc,repository),key->readBytes.get());
        System.out.println("FONT348_POSTGRES server="+admin.queryForObject("show server_version",String.class)+" schema="+schema);
    }
    @BeforeEach void seed() {
        owner=sequence.addAndGet(10);editor=owner+1;actor.set(editor);diary=UUID.randomUUID();file=UUID.randomUUID();readBytes=()->CONTENT;
        for(long id=owner;id<owner+4;id++)jdbc.update("insert into users(user_id,nickname,nickname_key,status) values(?,?,?,'ACTIVE')",id,"font"+id,"font"+id);
        jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'font regression')",diary,owner);
        for(int i=0;i<3;i++)jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,?,?,'#123456')",diary,owner+i,new String[]{"OWNER","EDITOR","VIEWER"}[i]);
        jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,status,storage_key,mime_type,file_size,original_filename) values(?,?,'FONT','READY',?,'font/ttf',12,'shared.ttf')",file,owner,"media/font/2026/10/"+file+".ttf");
        jdbc.update("insert into diary_handwriting_fonts(diary_id,font_media_file_id,granted_by_user_id) values(?,?,?)",diary,file,owner);
    }
    @AfterAll void cleanup() throws Exception {
        if(schema!=null && schema.matches("font348_[0-9a-f]{32}"))admin.execute("drop schema "+schema+" cascade");
        if(!evidence.isEmpty()){
            var target=Path.of("build/contracts/font348-postgres-locks.json");java.nio.file.Files.createDirectories(target.getParent());
            java.nio.file.Files.writeString(target,new tools.jackson.databind.ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(evidence));
        }
    }
    FontService.Download download(){return tx.execute(s->service.download(diary,file));}
    void error(int status,Runnable action){assertThatThrownBy(action::run).isInstanceOfSatisfying(DiaryDetailException.class,e->assertThat(e.status().value()).isEqualTo(status));}
    int pid(){return jdbc.queryForObject("select pg_backend_pid()",Integer.class);}
    void await(CountDownLatch latch){try{if(!latch.await(8,TimeUnit.SECONDS))throw new IllegalStateException("latch timeout");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}}
    void blocked(String label,int blocker,int waiter,Future<?> waiting) {
        long deadline=System.nanoTime()+Duration.ofSeconds(4).toNanos();
        while(System.nanoTime()<deadline){
            boolean locked=Boolean.TRUE.equals(admin.queryForObject("select ? = any(pg_blocking_pids(?))",Boolean.class,blocker,waiter));
            if(locked){evidence.add(Map.of("case",label,"blockerPid",blocker,"waiterPid",waiter,"postgresBlockingObserved",true));return;}
            if(waiting.isDone())break;
            java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
        }
        fail(label+": expected actual PostgreSQL blocking PID edge");
    }
    void mutate(String kind){
        switch(kind){
            case "disable" -> service.setEnabled(diary,file,false);
            case "revoke" -> jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and user_id=?",diary,editor);
            case "delete" -> jdbc.update("update media_files set deleted_at=current_timestamp where media_file_id=?",file);
            default -> throw new IllegalArgumentException(kind);
        }
    }
    void downloadFirst(String kind)throws Exception{
        var pool=Executors.newFixedThreadPool(2);var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var readerPid=new CompletableFuture<Integer>();var writerPid=new CompletableFuture<Integer>();
        readBytes=()->{readerPid.complete(pid());entered.countDown();await(release);return CONTENT;};
        try{
            var read=pool.submit(this::download);await(entered);
            var write=pool.submit(()->tx.execute(s->{writerPid.complete(pid());mutate(kind);return true;}));
            blocked("download-first-"+kind,readerPid.get(5,TimeUnit.SECONDS),writerPid.get(5,TimeUnit.SECONDS),write);
            release.countDown();assertThat(read.get(8,TimeUnit.SECONDS).content()).isEqualTo(CONTENT);assertThat(write.get(8,TimeUnit.SECONDS)).isTrue();
            error(404,this::download);
        }finally{release.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(12,TimeUnit.SECONDS)).isTrue();}
    }
    void changeFirst(String kind,boolean rollback)throws Exception{
        var pool=Executors.newFixedThreadPool(2);var changed=new CountDownLatch(1);var release=new CountDownLatch(1);var writerPid=new CompletableFuture<Integer>();var readerPid=new CompletableFuture<Integer>();var storageReads=new AtomicInteger();readBytes=()->{storageReads.incrementAndGet();return CONTENT;};
        try{
            var write=pool.submit(()->tx.execute(s->{writerPid.complete(pid());mutate(kind);changed.countDown();await(release);if(rollback)s.setRollbackOnly();return true;}));await(changed);
            var read=pool.submit(()->tx.execute(s->{readerPid.complete(pid());return service.download(diary,file);}));
            blocked("change-first-"+kind+(rollback?"-rollback":"-commit"),writerPid.get(5,TimeUnit.SECONDS),readerPid.get(5,TimeUnit.SECONDS),read);
            release.countDown();assertThat(write.get(8,TimeUnit.SECONDS)).isTrue();
            if(rollback){assertThat(read.get(8,TimeUnit.SECONDS).content()).isEqualTo(CONTENT);assertThat(storageReads).hasValue(1);}
            else{assertThatThrownBy(()->read.get(8,TimeUnit.SECONDS)).isInstanceOfSatisfying(ExecutionException.class,e->assertThat(e.getCause()).isInstanceOfSatisfying(DiaryDetailException.class,c->assertThat(c.status().value()).isEqualTo(404)));assertThat(storageReads).hasValue(0);}
        }finally{release.countDown();pool.shutdownNow();assertThat(pool.awaitTermination(12,TimeUnit.SECONDS)).isTrue();}
    }
    @Test void migratedSchemaAndRolesMatchTheContract(){
        assertThat(download().content()).isEqualTo(CONTENT);actor.set(owner);assertThat(download().mimeType()).isEqualTo("font/ttf");
        for(long denied:new long[]{owner+2,owner+3}){actor.set(denied);error(404,this::download);}actor.set(editor);
        jdbc.update("update users set status='INACTIVE' where user_id=?",editor);error(401,this::download);
    }
    @Test void disableWaitsForAuthorizedBytes()throws Exception{downloadFirst("disable");}
    @Test void memberRevocationWaitsForAuthorizedBytes()throws Exception{downloadFirst("revoke");}
    @Test void mediaDeletionWaitsForAuthorizedBytes()throws Exception{downloadFirst("delete");}
    @Test void committedDisableBlocksAndThenRejectsDownload()throws Exception{changeFirst("disable",false);}
    @Test void committedRevocationBlocksAndThenRejectsDownload()throws Exception{changeFirst("revoke",false);}
    @Test void committedMediaDeletionBlocksAndThenRejectsDownload()throws Exception{changeFirst("delete",false);}
    @Test void rolledBackDisableRestoresDownload()throws Exception{changeFirst("disable",true);}
    @Test void rolledBackRevocationRestoresDownload()throws Exception{changeFirst("revoke",true);}
    @Test void rolledBackMediaDeletionRestoresDownload()throws Exception{changeFirst("delete",true);}
}
