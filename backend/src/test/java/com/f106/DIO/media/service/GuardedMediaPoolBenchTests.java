package com.f106.DIO.media.service;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import com.f106.DIO.media.domain.MediaFile;
import com.f106.DIO.media.domain.MediaLibraryCategory;
import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.storage.MediaFiles;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;

/** Controlled pool measurement, no actual S3 or shared database. */
@EnabledIfEnvironmentVariable(named="DIO_FONT348_POSTGRES",matches="true")
class GuardedMediaPoolBenchTests {
 @Test void measureSustainedConnectionsAndUnrelatedQueryUnderSlowStorage() throws Exception {
  String url=System.getenv("DIO_FONT348_PG_URL"),user=System.getenv("DIO_FONT348_PG_USER"),nonce=System.getenv("DIO_FONT348_PG_NONCE"),data=System.getenv("DIO_FONT348_PG_DATA");
  if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_font348_isolated") || !"font348".equals(user) || nonce==null || !nonce.matches("[0-9a-f]{32}") || data==null)throw new IllegalStateException("Dedicated cluster required");
  JdbcTemplate admin=new JdbcTemplate(new DriverManagerDataSource(url,user,""));
  assertThat(admin.queryForObject("select token from public.font348_isolation_marker",String.class)).isEqualTo(nonce);
  assertThat(Path.of(admin.queryForObject("show data_directory",String.class)).toAbsolutePath().normalize()).isEqualTo(Path.of(data).toAbsolutePath().normalize());
  String schema="font348_bench_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);
  HikariConfig config=new HikariConfig();config.setJdbcUrl(url);config.setUsername(user);config.setPassword("");config.setMaximumPoolSize(4);config.setMinimumIdle(4);config.setConnectionTimeout(5000);config.addDataSourceProperty("currentSchema",schema);config.addDataSourceProperty("ApplicationName","font348-pool-bench");
  var report=new ArrayList<String>();
  try(var pool=new HikariDataSource(config)) {
   var jdbc=new JdbcTemplate(pool);jdbc.execute("create table media_storage_deletion_queue(deletion_id uuid primary key,storage_key varchar(500) not null)");
   var persist=mock(MediaFileTransactionService.class);var files=mock(MediaFiles.class);
   var entered=new ConcurrentHashMap<String,Long>();
   doAnswer(call->{String key=call.getArgument(0);entered.put(key,System.nanoTime());Thread.sleep(1200);return null;}).when(files).put(any(),any(),any());
   when(persist.persist(any(),any())).thenAnswer(call->{MediaFile f=call.getArgument(0);UUID task=call.getArgument(1);jdbc.update("delete from media_storage_deletion_queue where deletion_id=?",task);return MediaFileResponse.from(f);});
   var guard=new GuardedMediaOperations(jdbc,new DataSourceTransactionManager(pool),files,persist);
   for(int[] scenario:new int[][]{{1,0},{4,0},{8,0},{8,3}}) {
    int concurrency=scenario[0], cap=scenario[1], expected=Math.min(concurrency,cap>0?cap:4); var permits=new Semaphore(cap>0?cap:concurrency);
    var records=new ArrayList<MediaFile>();var tasks=new ArrayList<UUID>();
    for(int i=0;i<concurrency;i++){UUID id=UUID.randomUUID(),task=UUID.randomUUID();String key="media/font/2026/10/"+id+".ttf";records.add(new MediaFile(id,1L,MediaType.FONT,MediaLibraryCategory.FONT,key,"test.ttf","font/ttf",12,"0".repeat(64)));tasks.add(task);jdbc.update("insert into media_storage_deletion_queue values (?,?)",task,key);}
    var start=new CountDownLatch(1);var workers=Executors.newFixedThreadPool(concurrency+1);var results=new ArrayList<Future<long[]>>();long wallStart=System.nanoTime();
    try {
     for(int i=0;i<concurrency;i++){final var media=records.get(i);final var task=tasks.get(i);results.add(workers.submit(()->{start.await();long begin=System.nanoTime();permits.acquire();try{guard.upload(media,task,new byte[12],"font/ttf");return new long[]{begin,entered.get(media.getStorageKey()),System.nanoTime()};}finally{permits.release();}}));}
     start.countDown(); long waitDeadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(entered.size()<expected && System.nanoTime()<waitDeadline)Thread.sleep(10);
     assertThat(entered.size()).isGreaterThanOrEqualTo(expected);
     int active=pool.getHikariPoolMXBean().getActiveConnections(),pending=pool.getHikariPoolMXBean().getThreadsAwaitingConnection();
     int idleInTx=admin.queryForObject("select count(*) from pg_stat_activity where application_name='font348-pool-bench' and state='idle in transaction'",Integer.class);
     var probe=workers.submit(()->{long begin=System.nanoTime();int value=jdbc.queryForObject("select 1",Integer.class);return new long[]{value,System.nanoTime()-begin};});
     var waits=new ArrayList<Long>();var durations=new ArrayList<Long>();for(var future:results){long[] v=future.get(12,TimeUnit.SECONDS);waits.add(TimeUnit.NANOSECONDS.toMillis(v[1]-v[0]));durations.add(TimeUnit.NANOSECONDS.toMillis(v[2]-v[0]));}
     long[] p=probe.get(12,TimeUnit.SECONDS);assertThat(p[0]).isEqualTo(1);Collections.sort(waits);Collections.sort(durations);
     long wall=TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-wallStart);String row=String.format(Locale.ROOT,"n=%d cap=%d active=%d idle_in_tx=%d pending=%d wait_p50_ms=%d wait_max_ms=%d duration_p50_ms=%d duration_max_ms=%d probe_ms=%d wall_ms=%d",concurrency,cap,active,idleInTx,pending,waits.get((waits.size()-1)/2),waits.get(waits.size()-1),durations.get((durations.size()-1)/2),durations.get(durations.size()-1),TimeUnit.NANOSECONDS.toMillis(p[1]),wall);report.add(row);System.out.println("FONT348_POOL_BENCH "+row);
     assertThat(active).isEqualTo(expected);assertThat(idleInTx).isEqualTo(expected);
    } finally {start.countDown();workers.shutdownNow();workers.awaitTermination(5,TimeUnit.SECONDS);entered.clear();}
   }
  } finally {if(schema.matches("font348_bench_[0-9a-f]{32}"))admin.execute("drop schema "+schema+" cascade");}
  Files.write(Path.of("../validation/pool-benchmark.txt"),report);
 }
}
