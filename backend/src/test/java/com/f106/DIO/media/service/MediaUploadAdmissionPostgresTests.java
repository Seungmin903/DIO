package com.f106.DIO.media.service;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.zaxxer.hikari.*;
import com.f106.DIO.media.domain.MediaStorageDeletionTask;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.support.MediaRequestException;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.mock.web.MockMultipartFile;

@EnabledIfEnvironmentVariable(named="DIO_FONT348_POSTGRES",matches="true")
class MediaUploadAdmissionPostgresTests {
 @Test void preservesOneConnectionRejectsOverflowAndReleasesInterruptedAndFailedRequests() throws Exception {
  String url=System.getenv("DIO_FONT348_PG_URL"),user=System.getenv("DIO_FONT348_PG_USER"),nonce=System.getenv("DIO_FONT348_PG_NONCE"),data=System.getenv("DIO_FONT348_PG_DATA");
  if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_font348_isolated") || !"font348".equals(user) || nonce==null || !nonce.matches("[0-9a-f]{32}") || data==null)throw new IllegalStateException("Dedicated cluster required");
  var admin=new JdbcTemplate(new DriverManagerDataSource(url,user,""));assertThat(admin.queryForObject("select token from public.font348_isolation_marker",String.class)).isEqualTo(nonce);assertThat(Path.of(admin.queryForObject("show data_directory",String.class)).toAbsolutePath().normalize()).isEqualTo(Path.of(data).toAbsolutePath().normalize());
  String schema="font348_admit_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);var config=new HikariConfig();config.setJdbcUrl(url);config.setUsername(user);config.setPassword("");config.setMaximumPoolSize(4);config.setMinimumIdle(4);config.setConnectionTimeout(5000);config.addDataSourceProperty("currentSchema",schema);config.addDataSourceProperty("ApplicationName","font348-admission-test");
  try(var pool=new HikariDataSource(config)) {
   var jdbc=new JdbcTemplate(pool);jdbc.execute("create table media_storage_deletion_queue(deletion_id uuid primary key,storage_key varchar(500) not null)");
   var gate=new MediaUploadAdmission(6,1,5000);var storage=mock(MediaFiles.class);var persist=mock(MediaFileTransactionService.class);var queue=mock(MediaStorageDeletionQueueService.class);var guarded=new GuardedMediaOperations(jdbc,new DataSourceTransactionManager(pool),storage,persist);var service=new MediaService(storage,persist,queue,guarded,gate, org.mockito.Mockito.mock(com.f106.DIO.inventory.InventoryLimits.class));
   when(queue.reserveUploadCleanup(any(),any())).thenAnswer(call->{var task=new MediaStorageDeletionTask(call.getArgument(0),call.getArgument(1));jdbc.update("insert into media_storage_deletion_queue values (?,?)",task.getDeletionId(),task.getStorageKey());return task;});
   when(persist.persist(any(),any())).thenAnswer(call->{MediaFile file=call.getArgument(0);UUID id=call.getArgument(1);jdbc.update("delete from media_storage_deletion_queue where deletion_id=?",id);return MediaFileResponse.from(file);});
   var entered=new CountDownLatch(3);var release=new CountDownLatch(1);var interrupted=new CountDownLatch(1);var flagged=new AtomicBoolean();
   doAnswer(call->{entered.countDown();if(!release.await(8,TimeUnit.SECONDS))throw new IllegalStateException("timeout");return null;}).when(storage).put(any(),any(),any());
   var gif=new MockMultipartFile("file","ok.gif","image/gif","GIF89a".getBytes());var executor=Executors.newFixedThreadPool(5);var uploads=new ArrayList<Future<MediaFileResponse>>();
   try {
    for(int i=0;i<3;i++)uploads.add(executor.submit(()->service.upload(gif,null,1L)));assertThat(entered.await(8,TimeUnit.SECONDS)).isTrue();assertThat(pool.getHikariPoolMXBean().getActiveConnections()).isEqualTo(3);
    var probe=executor.submit(()->jdbc.queryForObject("select 1",Integer.class));assertThat(probe.get(2,TimeUnit.SECONDS)).isEqualTo(1);
    var thread=new AtomicReference<Thread>();var waiting=executor.submit(()->{thread.set(Thread.currentThread());try{service.upload(gif,null,1L);}catch(MediaRequestException e){flagged.set(Thread.currentThread().isInterrupted() && e.status().value()==503);interrupted.countDown();}});
    long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(2);while((thread.get()==null||thread.get().getState()!=Thread.State.TIMED_WAITING)&&System.nanoTime()<deadline)Thread.yield();assertThat(thread.get()).isNotNull();assertThat(thread.get().getState()).isEqualTo(Thread.State.TIMED_WAITING);
    assertThatThrownBy(()->service.upload(gif,null,1L)).isInstanceOfSatisfying(MediaRequestException.class,e->assertThat(e.status().value()).isEqualTo(503));
    waiting.cancel(true);assertThat(interrupted.await(2,TimeUnit.SECONDS)).isTrue();assertThat(flagged.get()).isTrue();release.countDown();for(var result:uploads)assertThat(result.get(8,TimeUnit.SECONDS).mediaType()).isEqualTo("IMAGE");
    assertThat(jdbc.queryForObject("select count(*) from media_storage_deletion_queue",Integer.class)).isZero();
    doThrow(new IllegalStateException("storage failure")).when(storage).put(any(),any(),any());assertThatThrownBy(()->service.upload(gif,null,1L)).isInstanceOf(IllegalStateException.class);
    assertThat(jdbc.queryForObject("select count(*) from media_storage_deletion_queue",Integer.class)).isEqualTo(1);try(var permit=gate.acquire()){assertThat(permit).isNotNull();}
    UUID remaining=jdbc.queryForObject("select deletion_id from media_storage_deletion_queue",UUID.class);assertThat(guarded.deleteIfUnlocked(remaining)).isTrue();assertThat(jdbc.queryForObject("select count(*) from media_storage_deletion_queue",Integer.class)).isZero();
   } finally {release.countDown();executor.shutdownNow();executor.awaitTermination(5,TimeUnit.SECONDS);}
  } finally {if(schema.matches("font348_admit_[0-9a-f]{32}"))admin.execute("drop schema "+schema+" cascade");}
 }
}
