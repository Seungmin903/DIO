package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import com.f106.DIO.media.domain.*;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.storage.MediaFiles;

@EnabledIfEnvironmentVariable(named="DIO_FONT348_POSTGRES",matches="true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class GuardedMediaPostgresTests {
 JdbcTemplate admin,jdbc; DriverManagerDataSource ds; String schema; GuardedMediaOperations guard; MediaFiles files; MediaFileTransactionService persistence; AtomicBoolean exists; UUID task; MediaFile media;
 @BeforeAll void database() {
  String url=System.getenv("DIO_FONT348_PG_URL"), user=System.getenv("DIO_FONT348_PG_USER"), marker=System.getenv("DIO_FONT348_PG_NONCE"), data=System.getenv("DIO_FONT348_PG_DATA");
  if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_font348_isolated") || !"font348".equals(user) || marker==null || !marker.matches("[0-9a-f]{32}") || data==null) throw new IllegalStateException("Dedicated guarded cluster required");
  admin=new JdbcTemplate(new DriverManagerDataSource(url,user,""));
  assertThat(admin.queryForObject("select token from public.font348_isolation_marker",String.class)).isEqualTo(marker);
  assertThat(Path.of(admin.queryForObject("show data_directory",String.class)).toAbsolutePath().normalize()).isEqualTo(Path.of(data).toAbsolutePath().normalize());
  schema="font348_guard_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);
  ds=new DriverManagerDataSource(url,user,""); var props=new Properties();props.setProperty("currentSchema",schema);ds.setConnectionProperties(props);
  jdbc=new JdbcTemplate(ds);jdbc.execute("create table media_storage_deletion_queue (deletion_id uuid primary key, storage_key varchar(500) not null)");jdbc.execute("create table persisted_media (id uuid primary key)");
 }
 @BeforeEach void setup() {
  task=UUID.randomUUID();var id=UUID.randomUUID();String key="media/font/2026/10/"+id+".ttf";media=new MediaFile(id,1L,com.f106.DIO.media.domain.MediaType.FONT,MediaLibraryCategory.FONT,key,"f.ttf","font/ttf",12,"0".repeat(64));
  jdbc.update("insert into media_storage_deletion_queue values (?,?)",task,key);
  files=mock(MediaFiles.class);persistence=mock(MediaFileTransactionService.class);exists=new AtomicBoolean();
  doAnswer(call -> {exists.set(false);return null;}).when(files).delete(any());
  when(persistence.persist(any(),any())).thenAnswer(call->{jdbc.update("insert into persisted_media values (?)",id);jdbc.update("delete from media_storage_deletion_queue where deletion_id=?",task);return MediaFileResponse.from(media);});
  guard=new GuardedMediaOperations(jdbc,new DataSourceTransactionManager(ds),files,persistence);
 }
 @AfterAll void cleanup() { if(schema!=null && schema.matches("font348_guard_[0-9a-f]{32}")) admin.execute("drop schema "+schema+" cascade"); }
 void await(CountDownLatch latch) { try { if(!latch.await(10,TimeUnit.SECONDS))throw new IllegalStateException("timeout"); } catch(InterruptedException e) {Thread.currentThread().interrupt();throw new IllegalStateException(e);} }
 @Test void slowPutHasRealLockAndCleanupSkipsUntilSuccessfulCommit() throws Exception {
  var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var pid=new CompletableFuture<Integer>();
  doAnswer(call->{exists.set(true);pid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));entered.countDown();await(release);return null;}).when(files).put(any(),any(),any());
  var pool=Executors.newSingleThreadExecutor();try {
   var upload=pool.submit(()->guard.upload(media,task,new byte[12],"font/ttf"));await(entered);int ownerPid=pid.get(5,TimeUnit.SECONDS);
   assertThat(admin.queryForObject("select exists(select 1 from pg_locks where pid=? and mode='RowShareLock' and granted)",Boolean.class,ownerPid)).isTrue();
   assertThat(guard.deleteIfUnlocked(task)).isFalse();assertThat(exists.get()).isTrue();verify(files,never()).delete(any());
   release.countDown();assertThat(upload.get(10,TimeUnit.SECONDS)).isNotNull();assertThat(guard.deleteIfUnlocked(task)).isFalse();assertThat(exists.get()).isTrue();
   assertThat(jdbc.queryForObject("select count(*) from persisted_media where id=?",Integer.class,media.getMediaFileId())).isEqualTo(1);
  } finally {release.countDown();pool.shutdownNow();}
 }
 @Test void terminatedDatabaseSessionRollsBackThenRecoveryDeletesOrphan() throws Exception {
  var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var pid=new CompletableFuture<Integer>();
  doAnswer(call->{exists.set(true);pid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));entered.countDown();await(release);return null;}).when(files).put(any(),any(),any());
  var pool=Executors.newSingleThreadExecutor();try {
   var upload=pool.submit(()->guard.upload(media,task,new byte[12],"font/ttf"));await(entered);
   assertThat(admin.queryForObject("select pg_terminate_backend(?)",Boolean.class,pid.get(5,TimeUnit.SECONDS))).isTrue();release.countDown();
   assertThatThrownBy(()->upload.get(10,TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class);
   assertThat(jdbc.queryForObject("select count(*) from media_storage_deletion_queue where deletion_id=?",Integer.class,task)).isEqualTo(1);
   assertThat(jdbc.queryForObject("select count(*) from persisted_media where id=?",Integer.class,media.getMediaFileId())).isZero();
   assertThat(guard.deleteIfUnlocked(task)).isTrue();assertThat(exists.get()).isFalse();assertThat(guard.deleteIfUnlocked(task)).isFalse();
  } finally {release.countDown();pool.shutdownNow();}
 }
 @Test void cleanupWonBeforeUploadPreventsAnyStorageWrite() {
  assertThat(guard.deleteIfUnlocked(task)).isTrue();
  assertThatThrownBy(()->guard.upload(media,task,new byte[12],"font/ttf")).isInstanceOf(IllegalStateException.class);
  verify(files,never()).put(any(),any(),any());assertThat(jdbc.queryForObject("select count(*) from persisted_media where id=?",Integer.class,media.getMediaFileId())).isZero();
 }
 @Test void failedCleanupRollsBackReservationAndCanRetry() {
  doThrow(new IllegalStateException("storage down")).doAnswer(call->{exists.set(false);return null;}).when(files).delete(any());exists.set(true);
  assertThatThrownBy(()->guard.deleteIfUnlocked(task)).isInstanceOf(IllegalStateException.class);
  assertThat(jdbc.queryForObject("select count(*) from media_storage_deletion_queue where deletion_id=?",Integer.class,task)).isEqualTo(1);
  assertThat(guard.deleteIfUnlocked(task)).isTrue();assertThat(exists.get()).isFalse();
 }
}
