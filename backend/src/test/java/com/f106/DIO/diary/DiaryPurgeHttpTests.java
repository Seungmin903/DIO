package com.f106.DIO.diary;

import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import com.f106.DIO.diary.trash.DiaryChildCleanup;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"spring.datasource.url=jdbc:h2:mem:diary-permanent-http;MODE=PostgreSQL","dio.auth.session-cleanup.enabled=false"})
class DiaryPurgeHttpTests extends DiaryHttpTestSupport {
    @MockitoSpyBean DiaryChildCleanup cleanup;
    @BeforeEach void graphSchema() throws Exception {
        String sql=new String(getClass().getResourceAsStream("/db/migration/V1__initial_schema.sql").readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        var pattern=java.util.regex.Pattern.compile("CREATE TABLE \"([^\"]+)\" \\((.*?)\\n\\);",java.util.regex.Pattern.DOTALL);
        var matcher=pattern.matcher(sql);
        Set<String> needed=Set.of("media_files","canvas_elements","element_strokes","canvas_history_operations","diary_invites","diary_handwriting_fonts","diary_media_library","notifications","ai_jobs");
        while(matcher.find())if(needed.contains(matcher.group(1)))jdbc.execute(matcher.group().replace("CREATE TABLE","CREATE TABLE IF NOT EXISTS").replace("\"","").replace("TIMESTAMPTZ(6)","TIMESTAMP(6) WITH TIME ZONE"));
        jdbc.execute("alter table diary_members add column if not exists last_opened_page_id uuid");
        jdbc.execute("create table if not exists diary_purge_receipts(diary_id uuid primary key,owner_user_id bigint not null,completed_at timestamp with time zone not null)");
    }
    @AfterEach void clearGraph(){
        for(String table:List.of("diary_purge_receipts","notifications","element_strokes","canvas_history_operations","canvas_elements","diary_handwriting_fonts","diary_media_library","diary_invites"))jdbc.update("delete from "+table);
        jdbc.update("update media_files set source_media_file_id=null");jdbc.update("delete from ai_jobs");jdbc.update("delete from media_files");
    }
    String created(String who,String title)throws Exception{return json.readTree(create(UUID.randomUUID().toString(),input(title,"landscape"),who).body()).path("diary").path("diaryId").asText();}
    String trashed()throws Exception{String id=created(token,"Target");assertThat(request("DELETE","/api/v1/diaries/"+id,token,null).statusCode()).isEqualTo(204);return id;}
    java.net.http.HttpResponse<String> purge(String id,String who)throws Exception{return request("DELETE","/api/v1/diaries/"+id+"?permanent=true",who,null);}
    UUID page(String id){return jdbc.queryForObject("select page_id from pages where diary_id=?",UUID.class,UUID.fromString(id));}
    UUID media(String key){UUID id=UUID.randomUUID();jdbc.update("insert into media_files(media_file_id,owner_user_id,storage_key,mime_type,file_size,status) values(?,?,?,'image/png',10,'READY')",id,owner,key);return id;}
    @Test void deletesFullGraphButPreservesOtherDiaryAndAllGlobalMediaAndNotificationHistory()throws Exception {
        String id=trashed(),other=created(editorToken,"Other");UUID target=UUID.fromString(id),otherId=UUID.fromString(other),page=page(id),otherPage=page(other);
        UUID shared=media("shared.png"),exclusive=media("exclusive.png"),derived=media("derived.png"),element=UUID.randomUUID();
        jdbc.update("update media_files set source_media_file_id=? where media_file_id=?",shared,derived);
        jdbc.update("insert into diary_media_library(diary_id,media_file_id,added_by_user_id,library_category) values(?,?,?,'PHOTO'),(?,?,?,'PHOTO'),(?,?,?,'PHOTO')",target,shared,owner,target,exclusive,owner,otherId,shared,editor);
        jdbc.update("insert into diary_handwriting_fonts(diary_id,font_media_file_id,granted_by_user_id) values(?,?,?),(?,?,?)",target,exclusive,owner,otherId,shared,editor);
        jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,media_file_id) values(?,?,'IMAGE',1,0,0,10,10,?)",element,page,shared);
        jdbc.update("insert into element_strokes(element_id,tool,color,stroke_width,base_width,base_height,points) values(?,'PEN','#000000',1,10,10,cast('[]' as jsonb))",element);
        jdbc.update("insert into canvas_history_operations(page_id,actor_user_id,client_operation_id,operation_type,before_state_json,after_state_json) values(?,?,?,'CREATE',cast('[]' as jsonb),cast('[]' as jsonb))",page,owner,UUID.randomUUID());
        jdbc.update("insert into diary_invites(diary_id,inviter_user_id,invite_type,token_hash,expires_at) values(?,?,'LINK',?,current_timestamp)",target,owner,new byte[32]);
        jdbc.update("insert into notifications(user_id,diary_id,page_id,notification_type) values(?,?,?,'PAGE_UPDATED'),(?,?,?,'PAGE_UPDATED')",owner,target,page,editor,otherId,otherPage);
        jdbc.update("update diary_members set last_opened_page_id=? where diary_id=?",page,target);
        // A malformed cross-diary last-opened pointer is detached, without deleting its member.
        jdbc.update("update diary_members set last_opened_page_id=? where diary_id=?",page,otherId);
        assertThat(purge(id,token).statusCode()).isEqualTo(204);
        assertThat(count("diaries")).isEqualTo(1);assertThat(count("pages")).isEqualTo(1);assertThat(count("diary_members")).isEqualTo(1);
        for(String table:List.of("canvas_elements","element_strokes","canvas_history_operations","diary_invites"))assertThat(count(table)).isZero();
        assertThat(count("diary_handwriting_fonts")).isEqualTo(1);assertThat(count("diary_media_library")).isEqualTo(1);assertThat(count("media_files")).isEqualTo(3);
        assertThat(jdbc.queryForObject("select source_media_file_id from media_files where media_file_id=?",UUID.class,derived)).isEqualTo(shared);
        assertThat(count("notifications")).isEqualTo(2);assertThat(jdbc.queryForObject("select count(*) from notifications where diary_id is null and page_id is null",Long.class)).isEqualTo(1);
        assertThat(get("/"+other,editorToken).statusCode()).isEqualTo(200);assertThat(get("/"+id,token).statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select last_opened_page_id from diary_members",UUID.class)).isNull();
        String output=System.getenv("DIO_DIARY_PURGE_CONTRACT_OUTPUT");if(output!=null)java.nio.file.Files.writeString(java.nio.file.Path.of(output),get("?status=trashed",token).body());
    }
    @Test void completionRetryOnlyAllowsOriginalOwnerAndPreservesCreationTombstones()throws Exception {
        String key=UUID.randomUUID().toString();String id=json.readTree(create(key,input("Replay","landscape"),token).body()).path("diary").path("diaryId").asText();
        request("DELETE","/api/v1/diaries/"+id,token,null);assertThat(purge(id,token).statusCode()).isEqualTo(204);
        var completed=jdbc.queryForObject("select completed_at from diary_purge_receipts",java.sql.Timestamp.class);
        var retry=purge(id,token);assertThat(retry.statusCode()).isEqualTo(204);assertThat(retry.body()).isEmpty();assertThat(retry.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(jdbc.queryForObject("select completed_at from diary_purge_receipts",java.sql.Timestamp.class)).isEqualTo(completed);
        assertThat(purge(id,editorToken).statusCode()).isEqualTo(404);assertThat(create(key,input("Replay","landscape"),token).statusCode()).isEqualTo(409);
        assertThat(count("diary_creation_requests")).isEqualTo(1);assertThat(count("diary_purge_receipts")).isEqualTo(1);
    }
    @Test void failureAfterChildCleanupRollsBackAndSameRequestCanRetry()throws Exception {
        String id=trashed();var fail=new java.util.concurrent.atomic.AtomicBoolean(true);
        org.mockito.Mockito.doAnswer(call->{call.callRealMethod();if(fail.getAndSet(false))throw new IllegalStateException("injected cleanup failure");return null;}).when((DiaryChildCleanup)org.springframework.test.util.AopTestUtils.getUltimateTargetObject(cleanup)).remove(org.mockito.ArgumentMatchers.any());
        assertThat(purge(id,token).statusCode()).isEqualTo(500);assertThat(count("diaries")).isEqualTo(1);assertThat(count("pages")).isEqualTo(1);assertThat(count("diary_members")).isEqualTo(1);assertThat(count("diary_purge_receipts")).isZero();
        assertThat(purge(id,token).statusCode()).isEqualTo(204);assertThat(count("diaries")).isZero();
    }
    @Test void failureRecordingCompletionRollsBackEveryChildAndParent()throws Exception {
        String id=trashed();jdbc.execute("alter table diary_purge_receipts add constraint qa_purge_fail check(owner_user_id<0)");
        try{assertThat(purge(id,token).statusCode()).isEqualTo(500);assertThat(count("pages")).isEqualTo(1);assertThat(count("diary_members")).isEqualTo(1);assertThat(count("diaries")).isEqualTo(1);}
        finally{jdbc.execute("alter table diary_purge_receipts drop constraint qa_purge_fail");}
        assertThat(purge(id,token).statusCode()).isEqualTo(204);
    }
    @Test void permissionAndStateAreRecheckedAndExpiredTrashCanBePurged()throws Exception {
        String id=created(token,"Active");assertThat(purge(id,token).statusCode()).isEqualTo(409);assertThat(purge(id,null).statusCode()).isEqualTo(401);
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,is_favorite,joined_at) values(?,?,'EDITOR','#CED9EE',false,current_timestamp)",UUID.fromString(id),editor);
        assertThat(purge(id,editorToken).statusCode()).isEqualTo(403);jdbc.update("update diary_members set left_at=current_timestamp where user_id=?",editor);assertThat(purge(id,editorToken).statusCode()).isEqualTo(404);
        jdbc.update("update diaries set deleted_at=?",java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(40L*86400)));
        assertThat(purge(id,token).statusCode()).isEqualTo(204);assertThat(purge("not-uuid",token).statusCode()).isEqualTo(400);assertThat(purge(UUID.randomUUID().toString(),token).statusCode()).isEqualTo(404);
    }
    @Test void sixConcurrentRequestsCommitOneCompletionAndAllReturn204()throws Exception {
        String id=trashed();var pool=java.util.concurrent.Executors.newFixedThreadPool(6);
        try{var start=new java.util.concurrent.CountDownLatch(1);var tasks=new ArrayList<java.util.concurrent.Future<Integer>>();for(int n=0;n<6;n++)tasks.add(pool.submit(()->{start.await();return purge(id,token).statusCode();}));start.countDown();for(var t:tasks)assertThat(t.get(20,java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(204);}
        finally{pool.shutdownNow();}assertThat(count("diary_purge_receipts")).isEqualTo(1);
    }
    @Test void restoredBeforePurgeIsProtectedAndMalformedRequestsWriteNothing()throws Exception {
        String id=trashed();request("POST","/api/v1/diaries/"+id+"/restore",token,null);assertThat(purge(id,token).statusCode()).isEqualTo(409);
        assertThat(request("DELETE","/api/v1/diaries/"+id+"?permanent=true&unknown=1",token,null).statusCode()).isEqualTo(400);
        assertThat(request("DELETE","/api/v1/diaries/"+id+"?permanent=true",token,"{}").statusCode()).isEqualTo(400);assertThat(count("diaries")).isEqualTo(1);
    }
}
