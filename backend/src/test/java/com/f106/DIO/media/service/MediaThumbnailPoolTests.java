package com.f106.DIO.media.service;

import com.f106.DIO.media.domain.MediaType;
import com.f106.DIO.media.storage.*;
import com.f106.DIO.media.support.MediaRequestException;
import com.zaxxer.hikari.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Holds storage PUT open until a probe on the same real pool completes; no S3/development DB calls. */
class MediaThumbnailPoolTests {
    JdbcTemplate admin;
    String schema;
    HikariDataSource pool;
    JdbcTemplate jdbc;

    void database(int poolSize) {
        var config=new HikariConfig();
        if("true".equals(System.getenv("DIO_THUMBNAIL_POOL_POSTGRES_QA"))) {
            String url=System.getenv("DIO_THUMBNAIL_POOL_POSTGRES_URL");
            if(url==null||!url.matches("jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/dio_thumbnail_pool_qa"))
                throw new IllegalStateException("Disposable loopback dio_thumbnail_pool_qa required; no fallback");
            String password=System.getenv("DIO_THUMBNAIL_POOL_POSTGRES_PASSWORD");
            admin=new JdbcTemplate(new DriverManagerDataSource(url,"postgres",password));
            schema="thumbnail_pool_"+UUID.randomUUID().toString().replace("-","");
            admin.execute("create schema "+schema);
            config.setJdbcUrl(url+"?currentSchema="+schema);
            config.setUsername("postgres"); config.setPassword(password);
        } else {
            config.setJdbcUrl("jdbc:h2:mem:thumbnail-pool-"+UUID.randomUUID()+";MODE=PostgreSQL;LOCK_TIMEOUT=1000");
            config.setUsername("sa");
        }
        config.setMaximumPoolSize(poolSize); config.setMinimumIdle(poolSize); config.setConnectionTimeout(3000);
        pool=new HikariDataSource(config); jdbc=new JdbcTemplate(pool);
        jdbc.execute("create table media_files(media_file_id uuid primary key,status varchar(20),storage_key varchar(500))");
    }
    @AfterEach void close() {
        if(pool!=null)pool.close();
        if(schema!=null&&schema.matches("thumbnail_pool_[a-f0-9]{32}"))admin.execute("drop schema "+schema+" cascade");
    }

    @ParameterizedTest @CsvSource({"6,4,2","12,8,4"})
    void delayedThumbnailWritesStayWithinAdmissionAndLeavePoolForOrdinaryQueries(int units,int poolSize,int maximum)throws Exception {
        database(poolSize);
        var files=mock(MediaFiles.class); var transactions=mock(MediaFileTransactionService.class);
        var gate=new MediaUploadAdmission(units,0,0);
        var guard=new GuardedMediaOperations(jdbc,new DataSourceTransactionManager(pool),files,transactions);
        var service=new MediaService(files,transactions,mock(MediaStorageDeletionQueueService.class),guard,gate);
        var output=new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2,2,2),"png",output);
        byte[] source=output.toByteArray();
        int requestCount=maximum+6;
        var ids=new ArrayList<UUID>(); var keys=new HashMap<UUID,String>();
        for(int i=1;i<=requestCount;i++){
            // Distinct stripe indices: a stripe collision must not accidentally enforce our global limit.
            UUID id=new UUID(0,i);String key=MediaStorageKeys.create(MediaType.IMAGE,"png",id);
            ids.add(id);keys.put(id,key);jdbc.update("insert into media_files values(?,'READY',?)",id,key);
            when(transactions.storageReference(id,7L)).thenReturn(new MediaFileTransactionService.StorageReference("image/png",null,key));
        }
        var entered=new CountDownLatch(maximum);var release=new CountDownLatch(1);
        var active=new AtomicInteger();var peak=new AtomicInteger();var published=new ConcurrentHashMap<String,byte[]>();
        when(files.read(anyString())).thenAnswer(call->{
            String key=call.getArgument(0);
            if(!key.endsWith(".thumbnail-v1.png"))return source;
            byte[] bytes=published.get(key);if(bytes==null)throw MediaStorageException.missing();return bytes;
        });
        doAnswer(call->{
            int n=active.incrementAndGet();peak.accumulateAndGet(n,Math::max);entered.countDown();
            try{if(!release.await(15,TimeUnit.SECONDS))throw new AssertionError("storage release timed out");published.put(call.getArgument(0),call.getArgument(1));}
            finally{active.decrementAndGet();}
            return null;
        }).when(files).put(anyString(),any(),eq("image/png"));
        var workers=Executors.newFixedThreadPool(requestCount+1);var requests=new ArrayList<Future<Integer>>();
        try{
            for(int i=0;i<maximum;i++){UUID id=ids.get(i);requests.add(workers.submit(()->{service.thumbnail(id,7L);return 200;}));}
            assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
            assertThat(pool.getHikariPoolMXBean().getActiveConnections()).isEqualTo(maximum);
            for(int i=maximum;i<requestCount;i++){
                UUID id=ids.get(i);
                requests.add(workers.submit(()->{
                    try{service.thumbnail(id,7L);return 200;}
                    catch(MediaRequestException busy){assertThat(busy.code()).isEqualTo("MEDIA_UPLOAD_BUSY");return busy.status().value();}
                }));
            }
            for(int i=maximum;i<requestCount;i++)assertThat(requests.get(i).get(3,TimeUnit.SECONDS)).isEqualTo(503);
            var normal=workers.submit(()->jdbc.queryForObject("select count(*) from media_files",Integer.class));
            assertThat(normal.get(3,TimeUnit.SECONDS)).isEqualTo(requestCount);
            assertThat(release.getCount()).as("ordinary DB query completes while every storage write remains blocked").isEqualTo(1);
            assertThat(pool.getHikariPoolMXBean().getThreadsAwaitingConnection()).isZero();
            assertThat(peak.get()).isEqualTo(maximum);
            release.countDown();
            for(int i=0;i<maximum;i++)assertThat(requests.get(i).get(5,TimeUnit.SECONDS)).isEqualTo(200);
            assertThat(pool.getHikariPoolMXBean().getActiveConnections()).isZero();
        }finally{release.countDown();workers.shutdownNow();assertThat(workers.awaitTermination(5,TimeUnit.SECONDS)).isTrue();}
    }

    @Test void defaultSharedAdmissionAlsoBoundsUploadsBelowDefaultHikariPoolSize() {
        // Use the real default Hikari validation and the same constructor/config defaults as Spring.
        var config=new HikariConfig();config.setJdbcUrl("jdbc:h2:mem:pool-defaults-"+UUID.randomUUID());config.validate();
        var gate=new MediaUploadAdmission("","",0,0);
        var permits=new ArrayList<MediaUploadAdmission.Permit>();
        try{
            for(int i=0;i<3;i++)permits.add(gate.acquire());
            assertThatThrownBy(gate::acquire).isInstanceOfSatisfying(MediaRequestException.class,e->assertThat(e.status().value()).isEqualTo(503));
            assertThat(config.getMaximumPoolSize()-permits.size()).as("default pool has capacity beyond maximum admitted upload writes").isGreaterThanOrEqualTo(2);
        }finally{permits.forEach(MediaUploadAdmission.Permit::close);}
    }
}
