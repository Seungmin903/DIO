package com.f106.DIO.media;

import com.f106.DIO.media.config.MediaIndexPreparation;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.sql.Connection;
import java.util.UUID;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DIO_MEMBER_PURGE_PG",matches="true")
class MediaIndexPreparationPostgresTests {
    private JdbcTemplate admin,jdbc;
    private DriverManagerDataSource source;
    private String schema;
    private final UUID diary=UUID.randomUUID(),page=UUID.randomUUID();
    @BeforeEach void setup(){
        String url=System.getenv("DB_URL"),user=System.getenv("POSTGRES_USER"),password=System.getenv("POSTGRES_PASSWORD");
        if(url==null||!url.matches("jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/dio_trash_qa"))throw new IllegalStateException("Dedicated loopback dio_trash_qa required");
        admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));schema="media_index_qa_"+UUID.randomUUID().toString().replace("-","");
        admin.execute("create schema "+schema);source=new DriverManagerDataSource(url+"?currentSchema="+schema,user,password);jdbc=new JdbcTemplate(source);
        Flyway.configure().dataSource(source).defaultSchema(schema).target("20").load().migrate();
        jdbc.update("insert into users(user_id,nickname,nickname_key) values(1,'index-test','index-test')");
        jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,1,'index-test')",diary);
        jdbc.update("insert into pages(page_id,diary_id,sort_key) values(?,?,1)",page,diary);
    }
    @AfterEach void cleanup(){if(schema!=null&&schema.matches("media_index_qa_[0-9a-f]{32}"))admin.execute("drop schema "+schema+" cascade");}
    @Test void upgradeBuildsConcurrentlyWithoutBlockingCanvasWrites()throws Exception{
        var pool=Executors.newSingleThreadExecutor();
        try(var blocker=source.getConnection()){
            blocker.setAutoCommit(false);insert(blocker);
            var build=pool.submit(()->MediaIndexPreparation.prepare(source,schema));
            try{
                boolean started=false;long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);
                while(System.nanoTime()<end){
                    if(jdbc.queryForObject("select count(*) from pg_stat_progress_create_index where relid=to_regclass(?)",Integer.class,schema+".canvas_elements")>0){started=true;break;}
                    Thread.sleep(20);
                }
                assertThat(started).as("concurrent build is waiting for the old writer").isTrue();
                // A regular CREATE INDEX would queue a write-blocking SHARE lock here.
                try(var writer=source.getConnection();var statement=writer.createStatement()){
                    statement.execute("set lock_timeout='2s'");insert(writer);
                }
                blocker.commit();assertThat(build.get(30,TimeUnit.SECONDS)).isEqualTo(3);
                var flyway=Flyway.configure().dataSource(source).defaultSchema(schema).load();flyway.migrate();flyway.validate();
                assertThat(MediaIndexPreparation.prepare(source,schema)).isZero();
            }finally{blocker.rollback();pool.shutdown();assertThat(pool.awaitTermination(30,TimeUnit.SECONDS)).isTrue();}
        }
    }
    @Test void alreadyAppliedV21KeepsItsChecksumAndValidIndexes(){
        var flyway=Flyway.configure().dataSource(source).defaultSchema(schema).load();flyway.migrate();
        Integer checksum=jdbc.queryForObject("select checksum from flyway_schema_history where version='21'",Integer.class);
        assertThat(MediaIndexPreparation.prepare(source,schema)).isZero();flyway.validate();
        assertThat(jdbc.queryForObject("select checksum from flyway_schema_history where version='21'",Integer.class)).isEqualTo(checksum);
        assertThat(jdbc.queryForObject("select count(*) from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=? and c.relname in ('idx_canvas_elements_json_media_refs','idx_canvas_history_before_media_refs','idx_canvas_history_after_media_refs') and i.indisvalid",Integer.class,schema)).isEqualTo(3);
    }
    private void insert(Connection connection)throws Exception{
        try(var statement=connection.prepareStatement("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,properties_json) values(?,?,'PHOTO',1,0,0,10,10,'{}')")){
            statement.setObject(1,UUID.randomUUID());statement.setObject(2,page);statement.executeUpdate();
        }
    }
}
