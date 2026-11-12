package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import com.f106.DIO.media.repository.MediaStorageDeletionTaskRepository;
import com.f106.DIO.media.storage.MediaFiles;

@EnabledIfEnvironmentVariable(named="DIO_FONT348_POSTGRES", matches="true")
class MediaQueueSkipLockedPostgresTests {
 JdbcTemplate admin, jdbc; NamedParameterJdbcTemplate named; TransactionTemplate tx; GuardedMediaOperations guarded;
 MediaFiles files; String schema; ExecutorService pool;
 @BeforeEach void setup() {
  String url=System.getenv("DIO_FONT348_PG_URL"), user=System.getenv("DIO_FONT348_PG_USER"), marker=System.getenv("DIO_FONT348_PG_NONCE"), data=System.getenv("DIO_FONT348_PG_DATA");
  if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_font348_isolated") || !"font348".equals(user) || marker==null || !marker.matches("[0-9a-f]{32}") || data==null) throw new IllegalStateException("Dedicated guarded cluster required");
  admin=new JdbcTemplate(new DriverManagerDataSource(url,user,""));
  assertThat(admin.queryForObject("select token from public.font348_isolation_marker",String.class)).isEqualTo(marker);
  assertThat(Path.of(admin.queryForObject("show data_directory",String.class)).toAbsolutePath().normalize()).isEqualTo(Path.of(data).toAbsolutePath().normalize());
  schema="font348_queue_"+UUID.randomUUID().toString().replace("-",""); admin.execute("create schema "+schema);
  var ds=new DriverManagerDataSource(url,user,"");var props=new Properties();props.setProperty("currentSchema",schema);ds.setConnectionProperties(props);
  jdbc=new JdbcTemplate(ds); named=new NamedParameterJdbcTemplate(ds);var manager=new DataSourceTransactionManager(ds);tx=new TransactionTemplate(manager);
  jdbc.execute("create table media_storage_deletion_queue (deletion_id uuid primary key, storage_key varchar(500) not null, next_attempt_at timestamptz not null)");
  files=mock(MediaFiles.class);guarded=new GuardedMediaOperations(jdbc,manager,files,mock(MediaFileTransactionService.class));pool=Executors.newSingleThreadExecutor();
 }
 @AfterEach void cleanup() { if(pool!=null)pool.shutdownNow();if(schema!=null && schema.matches("font348_queue_[0-9a-f]{32}"))admin.execute("drop schema "+schema+" cascade"); }
 UUID insert(String key, Instant at) {var id=UUID.randomUUID();jdbc.update("insert into media_storage_deletion_queue values (?,?,?)",id,key,java.sql.Timestamp.from(at));return id;}
 List<UUID> select(Instant now,int limit) {return tx.execute(s->named.query(MediaStorageDeletionTaskRepository.FIND_DUE_UNLOCKED,new MapSqlParameterSource().addValue("now",java.sql.Timestamp.from(now)).addValue("limit",limit),(rs,n)->rs.getObject("deletion_id",UUID.class)));}
 Future<?> hold(UUID id,CountDownLatch entered,CountDownLatch release) {return pool.submit(()->tx.execute(s->{jdbc.queryForObject("select deletion_id from media_storage_deletion_queue where deletion_id=? for update",UUID.class,id);entered.countDown();try {if(!release.await(10,TimeUnit.SECONDS))throw new IllegalStateException("timeout");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}return null;}));}
 @Test void skipsOldestLockedRowAndProcessesLaterThenRetriesAfterUnlock() throws Exception {
  Instant now=Instant.now();UUID locked=insert("locked",now.minusSeconds(20)), later=insert("later",now.minusSeconds(10)), future=insert("future",now.plusSeconds(60));
  var entered=new CountDownLatch(1);var release=new CountDownLatch(1);Future<?> worker=hold(locked,entered,release);
  try {assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();assertThat(select(now,1)).containsExactly(later);assertThat(guarded.deleteIfUnlocked(later)).isTrue();assertThat(select(now,1)).isEmpty();verify(files,never()).delete("locked");}
  finally {release.countDown();worker.get(5,TimeUnit.SECONDS);}
  assertThat(select(now,1)).containsExactly(locked);assertThat(guarded.deleteIfUnlocked(locked)).isTrue();verify(files).delete("locked");verify(files).delete("later");verify(files,never()).delete("future");assertThat(jdbc.queryForObject("select count(*) from media_storage_deletion_queue where deletion_id=?",Integer.class,future)).isEqualTo(1);
 }
 @Test void rechecksLockIfAnotherTransactionLocksAfterSelection() throws Exception {
  Instant now=Instant.now();UUID item=insert("race",now.minusSeconds(1));assertThat(select(now,1)).containsExactly(item);
  var entered=new CountDownLatch(1);var release=new CountDownLatch(1);Future<?> worker=hold(item,entered,release);
  try {assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();assertThat(guarded.deleteIfUnlocked(item)).isFalse();verify(files,never()).delete(any());}
  finally {release.countDown();worker.get(5,TimeUnit.SECONDS);}
  assertThat(select(now,1)).containsExactly(item);assertThat(guarded.deleteIfUnlocked(item)).isTrue();verify(files).delete("race");
 }
}
