package com.f106.DIO.media.service;
import java.nio.file.*;
import java.util.*;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import com.f106.DIO.media.domain.*;
import com.f106.DIO.media.storage.*;

/** A separate test worker deliberately halts during storage PUT; a new worker recovers it. */
public class GuardedMediaCrashProcess {
 public static void main(String[] args) throws Exception {
  String url=System.getenv("DIO_FONT348_PG_URL"), user=System.getenv("DIO_FONT348_PG_USER"), nonce=System.getenv("DIO_FONT348_PG_NONCE"), data=System.getenv("DIO_FONT348_PG_DATA"), mode=System.getenv("DIO_FONT348_CRASH_MODE");
  if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_font348_isolated") || !"font348".equals(user) || nonce==null || !nonce.matches("[0-9a-f]{32}") || data==null) throw new IllegalStateException("Dedicated guarded cluster required");
  var admin=new JdbcTemplate(new DriverManagerDataSource(url,user,""));
  if(!nonce.equals(admin.queryForObject("select token from public.font348_isolation_marker",String.class)) || !Path.of(data).toAbsolutePath().normalize().equals(Path.of(admin.queryForObject("show data_directory",String.class)).toAbsolutePath().normalize())) throw new IllegalStateException("Cluster mismatch");
  Path context=Path.of("../validation/guarded-crash-context.properties"), object=Path.of("../validation/guarded-crash-object.bin");
  var props=new Properties();
  if("crash".equals(mode)) {
   if(Files.exists(context)||Files.exists(object)) throw new IllegalStateException("Prior crash evidence exists; preserve it");
   String schema="font348_crash_"+UUID.randomUUID().toString().replace("-","");UUID task=UUID.randomUUID(),file=UUID.randomUUID();
   admin.execute("create schema "+schema);admin.execute("create table "+schema+".media_storage_deletion_queue(deletion_id uuid primary key, storage_key varchar(500) not null)");
   String key="media/font/2026/10/"+file+".ttf";admin.update("insert into "+schema+".media_storage_deletion_queue values (?,?)",task,key);
   props.setProperty("schema",schema);props.setProperty("task",task.toString());props.setProperty("file",file.toString());props.setProperty("key",key);
   try(var out=Files.newOutputStream(context,StandardOpenOption.CREATE_NEW)){props.store(out,"isolated crash evidence");}
  } else if("recover".equals(mode)) {try(var in=Files.newInputStream(context)){props.load(in);}} else throw new IllegalArgumentException("mode");
  String schema=props.getProperty("schema"),key=props.getProperty("key");UUID task=UUID.fromString(props.getProperty("task")),file=UUID.fromString(props.getProperty("file"));
  if(!schema.matches("font348_crash_[0-9a-f]{32}") || !key.equals("media/font/2026/10/"+file+".ttf")) throw new IllegalStateException("Bad test scope");
  var ds=new DriverManagerDataSource(url,user,"");var connectionProps=new Properties();connectionProps.setProperty("currentSchema",schema);ds.setConnectionProperties(connectionProps);
  var jdbc=new JdbcTemplate(ds);var fs=new MediaStorage(){public String provider(){return "LOCAL";}public void put(String k,byte[] b,String mime){try{if(!k.equals(key))throw new IllegalStateException();Files.write(object,b,StandardOpenOption.CREATE_NEW);System.out.println("CRASH_DURING_GUARDED_PUT");System.out.flush();Runtime.getRuntime().halt(73);}catch(Exception e){throw new RuntimeException(e);}}public byte[] read(String k){throw new UnsupportedOperationException();}public void delete(String k){try{if(!k.equals(key))throw new IllegalStateException();Files.deleteIfExists(object);}catch(Exception e){throw new RuntimeException(e);}}};
  var files=new MediaFiles(List.of(fs),"LOCAL",new StandardEnvironment());var guard=new GuardedMediaOperations(jdbc,new DataSourceTransactionManager(ds),files,null);
  if("crash".equals(mode)) {var media=new MediaFile(file,1L,MediaType.FONT,MediaLibraryCategory.FONT,key,"f.ttf","font/ttf",12,"0".repeat(64));guard.upload(media,task,new byte[12],"font/ttf");throw new AssertionError("Expected forced halt");}
  if(!Files.exists(object) || jdbc.queryForObject("select count(*) from media_storage_deletion_queue where deletion_id=?",Integer.class,task)!=1) throw new IllegalStateException("Orphan or reservation missing");
  if(!guard.deleteIfUnlocked(task) || Files.exists(object) || jdbc.queryForObject("select count(*) from media_storage_deletion_queue where deletion_id=?",Integer.class,task)!=0) throw new AssertionError("Recovery failed");
  admin.execute("drop schema "+schema+" cascade");System.out.println("CRASH_RECOVERY_PASS");
 }
}
