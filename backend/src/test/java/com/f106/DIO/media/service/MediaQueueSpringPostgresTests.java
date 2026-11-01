package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.Path;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import com.f106.DIO.DioApplication;
import com.f106.DIO.media.storage.MediaFiles;

@EnabledIfEnvironmentVariable(named="DIO_FONT348_POSTGRES", matches="true")
class MediaQueueSpringPostgresTests {
 @Test void realApplicationRepositorySkipsLockAndRetries() throws Exception {
  String url=System.getenv("DIO_FONT348_PG_URL"), user=System.getenv("DIO_FONT348_PG_USER"), token=System.getenv("DIO_FONT348_PG_NONCE"), data=System.getenv("DIO_FONT348_PG_DATA");
  if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_font348_isolated") || !"font348".equals(user) || token==null || !token.matches("[0-9a-f]{32}") || data==null) throw new IllegalStateException("Dedicated guarded cluster required");
  var admin=new JdbcTemplate(new DriverManagerDataSource(url,user,""));
  assertThat(admin.queryForObject("select token from public.font348_isolation_marker",String.class)).isEqualTo(token);
  assertThat(Path.of(admin.queryForObject("show data_directory",String.class)).toAbsolutePath().normalize()).isEqualTo(Path.of(data).toAbsolutePath().normalize());
  String schema="font348_spring_"+UUID.randomUUID().toString().replace("-","");admin.execute("create schema "+schema);
  var pool=Executors.newSingleThreadExecutor();var release=new CountDownLatch(1);
  try(var ctx=new SpringApplicationBuilder(DioApplication.class).web(WebApplicationType.SERVLET).run(
   "--server.address=127.0.0.1", "--server.port=0", "--spring.profiles.active=font348-live", "--spring.datasource.url="+url+"?currentSchema="+schema, "--spring.datasource.username=font348", "--spring.datasource.password=", "--spring.flyway.enabled=true", "--spring.flyway.default-schema="+schema, "--spring.jpa.hibernate.ddl-auto=validate", "--spring.jpa.open-in-view=false", "--dio.auth.jwt-secret="+Base64.getEncoder().encodeToString(new byte[32]), "--dio.auth.session-cleanup.enabled=false", "--dio.diary.receipt-cleanup.enabled=false", "--dio.diary.expiry-cleanup.enabled=false", "--dio.media.expiry-cleanup.enabled=false", "--dio.media.storage=local", "--dio.media.local-directory="+Path.of("../validation/media").toAbsolutePath(), "--dio.local-seed.enabled=false", "--dio.signup.photos.migrate-legacy=false", "--spring.mail.host=127.0.0.1")) {
   var jdbc=ctx.getBean(JdbcTemplate.class);var queue=ctx.getBean(MediaStorageDeletionQueueService.class);var guarded=ctx.getBean(GuardedMediaOperations.class);var files=ctx.getBean(MediaFiles.class);var tx=new TransactionTemplate(ctx.getBean(org.springframework.transaction.PlatformTransactionManager.class));
   UUID first=UUID.randomUUID(),second=UUID.randomUUID(),future=UUID.randomUUID();String prefix="media/font/2026/10/";String k1=prefix+first+".ttf",k2=prefix+second+".ttf";
   files.put(k1,new byte[]{1},"font/ttf");files.put(k2,new byte[]{2},"font/ttf");
   jdbc.update("insert into media_storage_deletion_queue(deletion_id,media_file_id,storage_key,next_attempt_at) values (?,?,?,now()-interval '2 minutes'),(?,?,?,now()-interval '1 minute'),(?,?,?,now()+interval '1 hour')",first,UUID.randomUUID(),k1,second,UUID.randomUUID(),k2,future,UUID.randomUUID(),prefix+future+".ttf");
   var entered=new CountDownLatch(1);Future<?> holder=pool.submit(()->tx.execute(s->{jdbc.queryForObject("select deletion_id from media_storage_deletion_queue where deletion_id=? for update",UUID.class,first);entered.countDown();try {if(!release.await(15,TimeUnit.SECONDS)) throw new IllegalStateException("lock timeout");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}return null;}));
   try {assertThat(entered.await(8,TimeUnit.SECONDS)).isTrue();var due=queue.next(1);assertThat(due).extracting(t->t.getDeletionId()).containsExactly(second);assertThat(due.get(0).getStorageKey()).isEqualTo(k2);assertThat(guarded.deleteIfUnlocked(second)).isTrue();assertThat(queue.next(1)).isEmpty();}
   finally {release.countDown();holder.get(8,TimeUnit.SECONDS);}
   assertThat(queue.next(1)).extracting(t->t.getDeletionId()).containsExactly(first);assertThat(guarded.deleteIfUnlocked(first)).isTrue();assertThat(queue.next(1)).isEmpty();assertThat(jdbc.queryForObject("select count(*) from media_storage_deletion_queue where deletion_id=?",Integer.class,future)).isEqualTo(1);
  } finally {release.countDown();pool.shutdownNow();if(schema.matches("font348_spring_[0-9a-f]{32}"))admin.execute("drop schema "+schema+" cascade");}
 }
}
