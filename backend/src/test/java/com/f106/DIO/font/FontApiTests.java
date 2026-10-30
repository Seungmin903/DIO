package com.f106.DIO.font;
import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.support.LoginSecrets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:font348;MODE=PostgreSQL;LOCK_TIMEOUT=10000"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class FontApiTests {
 @DynamicPropertySource static void key(DynamicPropertyRegistry r) {
  r.add("dio.auth.jwt-secret",()->Base64.getEncoder().encodeToString(new byte[32]));
  // Test application.yml shadows main resources: use the shipped path filter explicitly.
  var yaml=new org.springframework.beans.factory.config.YamlPropertiesFactoryBean();
  yaml.setResources(new org.springframework.core.io.FileSystemResource("src/main/resources/application.yml"));
  String paths=yaml.getObject().getProperty("springdoc.paths-to-match");
  r.add("springdoc.paths-to-match",()->paths);
 }
 @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired LoginJwt jwt; @Autowired RefreshTokenRepository sessions;
 @org.springframework.test.context.bean.override.mockito.MockitoBean FontFileReader files;
 static final byte[] FONT_BYTES={0,1,0,0,0,0,0,0,0,0,0,0};
 UUID diary,file,otherFile; String[] tokens;
 String path(){return "/api/v1/diaries/"+diary+"/fonts";}
 @BeforeEach void seed(){
  jdbc.execute("create table if not exists diary_members(diary_id uuid,user_id bigint,role varchar(20),left_at timestamp with time zone,primary key(diary_id,user_id))");
  jdbc.execute("create table if not exists media_files(media_file_id uuid primary key,owner_user_id bigint references users(user_id),media_type varchar(20),status varchar(20),original_filename varchar(255),mime_type varchar(100),created_at timestamp with time zone default current_timestamp,deleted_at timestamp with time zone)");
  jdbc.execute("alter table media_files add column if not exists storage_key varchar(500) default 'media/font/test.ttf'");
  jdbc.execute("alter table media_files add column if not exists file_size bigint default 12");
  org.mockito.Mockito.when(files.read(org.mockito.ArgumentMatchers.anyString())).thenReturn(FONT_BYTES);
  jdbc.execute("create table if not exists diary_handwriting_fonts(diary_id uuid references diaries(diary_id),font_media_file_id uuid references media_files(media_file_id),granted_by_user_id bigint references users(user_id),is_enabled boolean not null default true,created_at timestamp with time zone default current_timestamp,disabled_at timestamp with time zone,primary key(diary_id,font_media_file_id))");
  diary=UUID.randomUUID();file=UUID.randomUUID();otherFile=UUID.randomUUID();
  long base=Math.abs(new Random().nextInt(100000000))+1000L;tokens=new String[4];
  for(int i=0;i<4;i++){
   long id=base+i;
   jdbc.update("insert into users(user_id,nickname,nickname_key,profile_color,status,created_at,updated_at) values(?,?,?,'#123456','ACTIVE',current_timestamp,current_timestamp)",id,"u"+id,"u"+id);
   var session=sessions.saveAndFlush(new RefreshToken(id,LoginSecrets.hash(UUID.randomUUID().toString()),"test",Instant.now(),Instant.now().plusSeconds(600)));
   tokens[i]=jwt.issue(id,session.getSessionId(),Instant.now(),Instant.now().plusSeconds(300));
  }
  jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility,created_at,updated_at) values(?,?,'font','#123456','PLAIN','PRIVATE',current_timestamp,current_timestamp)",diary,base);
  for(int i=0;i<3;i++)jdbc.update("insert into diary_members(diary_id,user_id,role,is_favorite,joined_at,member_color) values(?,?,?,false,current_timestamp,'#123456')",diary,base+i,new String[]{"OWNER","EDITOR","VIEWER"}[i]);
  for(int i=0;i<2;i++)jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,status,original_filename,mime_type,storage_key,source_type,library_category,file_size,created_at) values(?,?,'FONT','READY','hand.ttf','font/ttf',?,'UPLOAD','FONT',12,current_timestamp)",i==0?file:otherFile,base+i,"media/font/"+(i==0?file:otherFile)+".ttf");
 }
 int share(String token,UUID id)throws Exception{return mvc.perform(post(path()).header("Authorization","Bearer "+token).contentType("application/json").content("{\"mediaFileId\":\""+id+"\"}")).andReturn().getResponse().getStatus();}
 int state(String token,boolean enabled)throws Exception{return mvc.perform(patch(path()+"/"+file).header("Authorization","Bearer "+token).contentType("application/json").content("{\"enabled\":"+enabled+"}")).andReturn().getResponse().getStatus();}
 @Test void lifecycleAndIdempotency()throws Exception{
  mvc.perform(get("/api/v1/handwriting-fonts").header("Authorization","Bearer "+tokens[0])).andExpect(status().isOk()).andExpect(jsonPath("$[0].mediaFileId").value(file.toString())).andExpect(jsonPath("$[0].fileSize").value(12));
  assertThat(share(tokens[0],file)).isEqualTo(204);assertThat(state(tokens[1],false)).isEqualTo(204);
  var stamp=jdbc.queryForObject("select disabled_at from diary_handwriting_fonts where diary_id=?",java.sql.Timestamp.class,diary);
  assertThat(share(tokens[0],file)).isEqualTo(204);assertThat(state(tokens[1],false)).isEqualTo(204);
  assertThat(jdbc.queryForObject("select disabled_at from diary_handwriting_fonts where diary_id=?",java.sql.Timestamp.class,diary)).isEqualTo(stamp);
  mvc.perform(get(path()).header("Authorization","Bearer "+tokens[1])).andExpect(status().isOk()).andExpect(jsonPath("$[0].enabled").value(false)).andExpect(jsonPath("$[0].fileSize").value(12));
  assertThat(state(tokens[0],true)).isEqualTo(204);assertThat(share(tokens[1],otherFile)).isEqualTo(204);assertThat(share(tokens[1],file)).isEqualTo(404);
 }
 @Test void sharedFontAcceptsLargeFileWithinBoundAndRejectsOverLimit()throws Exception {
  assertThat(share(tokens[0],file)).isEqualTo(204);
  byte[] large=new byte[22*1024*1024+512*1024];large[1]=1;
  jdbc.update("update media_files set file_size=? where media_file_id=?",large.length,file);
  org.mockito.Mockito.when(files.read(org.mockito.ArgumentMatchers.anyString())).thenReturn(large);
  mvc.perform(get(path()+"/"+file+"/file").header("Authorization","Bearer "+tokens[1])).andExpect(status().isOk()).andExpect(content().bytes(large));
  jdbc.update("update media_files set file_size=? where media_file_id=?",25*1024*1024+1,file);
  mvc.perform(get(path()+"/"+file+"/file").header("Authorization","Bearer "+tokens[1])).andExpect(status().isNotFound());
 }
 @Test void permissionsAndInvalidInputs()throws Exception{
  mvc.perform(get("/api/v1/handwriting-fonts")).andExpect(status().isUnauthorized());
  mvc.perform(post(path()).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
  for(int i:new int[]{2,3}){mvc.perform(get(path()).header("Authorization","Bearer "+tokens[i])).andExpect(status().isNotFound());assertThat(share(tokens[i],file)).isEqualTo(404);assertThat(state(tokens[i],false)).isEqualTo(404);}
  for(String body:List.of("{}","{\"mediaFileId\":null}","{\"mediaFileId\":\"bad\"}"))mvc.perform(post(path()).header("Authorization","Bearer "+tokens[0]).contentType("application/json").content(body)).andExpect(status().isBadRequest());
  for(String body:List.of("{}","{\"enabled\":null}"))mvc.perform(patch(path()+"/"+file).header("Authorization","Bearer "+tokens[0]).contentType("application/json").content(body)).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/diaries/bad/fonts").header("Authorization","Bearer "+tokens[0])).andExpect(status().isBadRequest());
  mvc.perform(get("/api/v1/diaries/"+UUID.randomUUID()+"/fonts").header("Authorization","Bearer "+tokens[0])).andExpect(status().isNotFound());
  assertThat(share(tokens[0],UUID.randomUUID())).isEqualTo(404);assertThat(state(tokens[0],true)).isEqualTo(404);
  // A real diary belonging to another account must be as inaccessible as a missing UUID.
  var ownDiary=diary;var foreignDiary=UUID.randomUUID();
  jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility,created_at,updated_at) select ?,owner_user_id+3,'other',cover_color,cover_style,visibility,created_at,updated_at from diaries where diary_id=?",foreignDiary,diary);
  diary=foreignDiary;
  mvc.perform(get(path()).header("Authorization","Bearer "+tokens[0])).andExpect(status().isNotFound());
  assertThat(share(tokens[0],file)).isEqualTo(404);assertThat(state(tokens[0],true)).isEqualTo(404);diary=ownDiary;
  jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and role='EDITOR'",diary);assertThat(share(tokens[1],otherFile)).isEqualTo(404);
  assertThat(share(tokens[0],file)).isEqualTo(204);jdbc.update("update media_files set deleted_at=current_timestamp where media_file_id=?",file);
  assertThat(share(tokens[0],file)).isEqualTo(404);assertThat(state(tokens[0],true)).isEqualTo(404);
  mvc.perform(get(path()).header("Authorization","Bearer "+tokens[0])).andExpect(jsonPath("$.length()").value(0));
 }
 @Test void concurrentShareAndStateChanges()throws Exception{
  var pool=Executors.newFixedThreadPool(4);
  try{
   var gate=new CountDownLatch(1);var results=new ArrayList<Future<Integer>>();
   for(int i=0;i<4;i++)results.add(pool.submit(()->{gate.await();return share(tokens[0],file);}));
   gate.countDown();for(var r:results)assertThat(r.get(20,TimeUnit.SECONDS)).isEqualTo(204);
   assertThat(jdbc.queryForObject("select count(*) from diary_handwriting_fonts where diary_id=?",Integer.class,diary)).isEqualTo(1);
   var gate2=new CountDownLatch(1);results.clear();
   for(int i=0;i<4;i++){final boolean enabled=i%2==0;final String token=tokens[i%2];results.add(pool.submit(()->{gate2.await();return state(token,enabled);}));}
   gate2.countDown();for(var r:results)assertThat(r.get(20,TimeUnit.SECONDS)).isEqualTo(204);
   assertThat(jdbc.queryForObject("select count(*) from diary_handwriting_fonts where diary_id=? and ((is_enabled and disabled_at is null) or (not is_enabled and disabled_at is not null))",Integer.class,diary)).isEqualTo(1);
  }finally{pool.shutdownNow();}
 }
 @Test void springdocExposesAllOperations()throws Exception{
  mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andExpect(jsonPath("$.paths['/api/v1/handwriting-fonts'].get").exists()).andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/fonts'].get").exists()).andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/fonts'].post").exists()).andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/fonts/{mediaFileId}'].patch").exists());
  mvc.perform(get("/v3/api-docs")).andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/fonts/{mediaFileId}/file'].get").exists());
 }
 @Test void deletedDiaryInactiveUserAndWrongMediaAreRejected()throws Exception{
  for(String change:List.of("media_type='IMAGE'","status='UPLOADING'")){
   jdbc.update("update media_files set "+change+" where media_file_id=?",file);
   assertThat(share(tokens[0],file)).isEqualTo(404);
   jdbc.update("update media_files set media_type='FONT',status='READY' where media_file_id=?",file);
  }
  var saved=diary;diary=UUID.randomUUID();
  assertThat(share(tokens[0],file)).isEqualTo(404);assertThat(state(tokens[0],true)).isEqualTo(404);diary=saved;
  jdbc.update("update diaries set deleted_at=current_timestamp where diary_id=?",diary);
  assertThat(share(tokens[0],file)).isEqualTo(404);
  mvc.perform(get(path()).header("Authorization","Bearer "+tokens[0])).andExpect(status().isNotFound());
  jdbc.update("update diaries set deleted_at=null where diary_id=?",diary);
  jdbc.update("update users set status='INACTIVE' where user_id=(select owner_user_id from diaries where diary_id=?)",diary);
  mvc.perform(get("/api/v1/handwriting-fonts").header("Authorization","Bearer "+tokens[0])).andExpect(status().isUnauthorized());
 }
 @Test void browserPreflightAllowsFontRoutesOnlyForConfiguredOrigins()throws Exception{
  for(String target:List.of("/api/v1/handwriting-fonts",path(),path()+"/"+file))
   mvc.perform(options(target).header("Origin","http://localhost:8081").header("Access-Control-Request-Method",target.endsWith(file.toString())?"PATCH":"GET").header("Access-Control-Request-Headers","Authorization,Content-Type"))
    .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:8081"));
  mvc.perform(options(path()).header("Origin","https://untrusted.invalid").header("Access-Control-Request-Method","POST")).andExpect(status().isForbidden());
 }
 @Test void concurrentDuplicateShareDoesNotUndoDisable()throws Exception{
  assertThat(share(tokens[0],file)).isEqualTo(204);
  var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
  try{
   var post=pool.submit(()->{gate.await();return share(tokens[0],file);});
   var patch=pool.submit(()->{gate.await();return state(tokens[1],false);});gate.countDown();
   assertThat(post.get(20,TimeUnit.SECONDS)).isEqualTo(204);assertThat(patch.get(20,TimeUnit.SECONDS)).isEqualTo(204);
   assertThat(jdbc.queryForObject("select is_enabled from diary_handwriting_fonts where diary_id=?",Boolean.class,diary)).isFalse();
  }finally{pool.shutdownNow();}
 }
 int download(String token)throws Exception{
  var request=get(path()+"/"+file+"/file");if(token!=null)request.header("Authorization","Bearer "+token);
  return mvc.perform(request).andReturn().getResponse().getStatus();
 }
 @Test void sharedDownloadRequiresActiveWriterAndEnabledLiveFont()throws Exception{
  assertThat(download(null)).isEqualTo(401);
  assertThat(download(tokens[0])).isEqualTo(404);
  assertThat(share(tokens[0],file)).isEqualTo(204);
  for(int i:new int[]{0,1})mvc.perform(get(path()+"/"+file+"/file").header("Authorization","Bearer "+tokens[i]))
   .andExpect(status().isOk()).andExpect(content().bytes(FONT_BYTES)).andExpect(content().contentType("font/ttf"))
   .andExpect(header().string("Cache-Control","private, no-store")).andExpect(header().string("X-Content-Type-Options","nosniff"));
  org.mockito.Mockito.clearInvocations(files);
  assertThat(download(tokens[2])).isEqualTo(404);assertThat(download(tokens[3])).isEqualTo(404);
  org.mockito.Mockito.verifyNoInteractions(files);
  assertThat(state(tokens[1],false)).isEqualTo(204);assertThat(download(tokens[0])).isEqualTo(404);
  assertThat(state(tokens[1],true)).isEqualTo(204);
  for(String change:List.of("media_type='IMAGE'","status='UPLOADING'","deleted_at=current_timestamp","file_size=6000000")){
   jdbc.update("update media_files set "+change+" where media_file_id=?",file);assertThat(download(tokens[0])).isEqualTo(404);
   jdbc.update("update media_files set media_type='FONT',status='READY',deleted_at=null,file_size=12 where media_file_id=?",file);
  }
  jdbc.update("update diary_members set left_at=current_timestamp where diary_id=? and role='EDITOR'",diary);assertThat(download(tokens[1])).isEqualTo(404);
  jdbc.update("update users set status='INACTIVE' where user_id=(select owner_user_id from diaries where diary_id=?)",diary);assertThat(download(tokens[0])).isEqualTo(401);
 }
 @Test void downloadRejectsWrongDiaryCorruptBytesAndStorageFailure()throws Exception{
  assertThat(share(tokens[0],file)).isEqualTo(204);
  var own=diary;diary=UUID.randomUUID();assertThat(download(tokens[0])).isEqualTo(404);diary=own;
  org.mockito.Mockito.when(files.read(org.mockito.ArgumentMatchers.anyString())).thenReturn(new byte[12]);assertThat(download(tokens[0])).isEqualTo(404);
  org.mockito.Mockito.when(files.read(org.mockito.ArgumentMatchers.anyString())).thenThrow(new com.f106.DIO.diary.detail.DiaryDetailException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"FONT_STORAGE_UNAVAILABLE","unavailable"));
  assertThat(download(tokens[0])).isEqualTo(503);
  mvc.perform(get(path()+"/bad/file").header("Authorization","Bearer "+tokens[0])).andExpect(status().isBadRequest());
 }
 @Test void downloadHoldsLocksUntilBytesMaterialized()throws Exception{
  for(String mutation:List.of("update diary_handwriting_fonts set is_enabled=false where diary_id=?","update diary_members set left_at=current_timestamp where diary_id=? and role='OWNER'","update media_files set deleted_at=current_timestamp where media_file_id=?")){
   assertThat(share(tokens[0],file)).isEqualTo(204);
   var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var mutationStarted=new CountDownLatch(1);
   org.mockito.Mockito.when(files.read(org.mockito.ArgumentMatchers.anyString())).thenAnswer(invocation->{entered.countDown();if(!release.await(5,TimeUnit.SECONDS))throw new IllegalStateException("read timeout");return FONT_BYTES;});
   var pool=Executors.newFixedThreadPool(2);
   try{
    var read=pool.submit(()->download(tokens[0]));assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
    UUID target=mutation.contains("media_files")?file:diary;
    var write=pool.submit(()->{mutationStarted.countDown();return jdbc.update(mutation,target);});assertThat(mutationStarted.await(5,TimeUnit.SECONDS)).isTrue();
    assertThatThrownBy(()->write.get(150,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
    release.countDown();assertThat(read.get(10,TimeUnit.SECONDS)).isEqualTo(200);assertThat(write.get(10,TimeUnit.SECONDS)).isPositive();
    assertThat(download(tokens[0])).isEqualTo(404);
   }finally{release.countDown();pool.shutdownNow();}
   jdbc.update("update diary_handwriting_fonts set is_enabled=true where diary_id=?",diary);
   jdbc.update("update diary_members set left_at=null where diary_id=?",diary);
   jdbc.update("update media_files set deleted_at=null where media_file_id=?",file);
  }
 }
}
