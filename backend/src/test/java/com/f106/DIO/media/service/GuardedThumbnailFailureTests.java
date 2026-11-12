package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import com.zaxxer.hikari.*;
import com.f106.DIO.media.storage.*;

class GuardedThumbnailFailureTests {
 @Test void failedStoragePutRollsBackAndReleasesTheConnectionAndRowLock() throws Exception {
  var config=new HikariConfig();config.setJdbcUrl("jdbc:h2:mem:"+UUID.randomUUID()+";LOCK_TIMEOUT=500");config.setUsername("sa");config.setMaximumPoolSize(2);config.setMinimumIdle(1);
  try(var pool=new HikariDataSource(config)){
   var jdbc=new JdbcTemplate(pool);var manager=new DataSourceTransactionManager(pool);var files=mock(MediaFiles.class);
   var guarded=new GuardedMediaOperations(jdbc,manager,files,mock(MediaFileTransactionService.class));
   jdbc.execute("create table media_files(media_file_id uuid primary key,status varchar(20),storage_key varchar(500))");
   UUID id=UUID.randomUUID();String key=MediaStorageKeys.create(com.f106.DIO.media.domain.MediaType.IMAGE,"png",id);
   jdbc.update("insert into media_files values(?, 'READY', ?)",id,key);
   doThrow(MediaStorageException.unavailable()).when(files).put(anyString(),any(),anyString());
   assertThatThrownBy(()->guarded.storeThumbnail(id,key,new byte[]{1})).isInstanceOf(MediaStorageException.class);
   assertThat(pool.getHikariPoolMXBean().getActiveConnections()).isZero();
   var executor=Executors.newSingleThreadExecutor();
   try{
    var result=executor.submit(()->new TransactionTemplate(manager).execute(status->jdbc.queryForObject("select storage_key from media_files where media_file_id=? for update",String.class,id)));
    assertThat(result.get(3,TimeUnit.SECONDS)).isEqualTo(key);
   }finally{executor.shutdownNow();}
   assertThat(pool.getHikariPoolMXBean().getActiveConnections()).isZero();
  }
 }
}
