package com.f106.DIO.diary;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.sql.Timestamp;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import com.f106.DIO.diary.trash.DiaryTime;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doReturn;

class DiaryTrashHttpTests extends DiaryHttpTestSupport {
    @MockitoSpyBean DiaryTime time;
    Instant now=Instant.parse("2026-10-27T12:00:00Z");
    @BeforeEach void clock(){doReturn(now).when(time).now();}
    String diary() throws Exception {
        var r=create(UUID.randomUUID().toString(),input("Shared diary","portrait"),token);assertThat(r.statusCode()).isEqualTo(201);
        String id=json.readTree(r.body()).path("diary").path("diaryId").asText();
        jdbc.update("update diaries set visibility='MEMBERS' where diary_id=?",UUID.fromString(id));
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,is_favorite,joined_at) values(?,?,'EDITOR','#CED9EE',true,current_timestamp)",UUID.fromString(id),editor);
        return id;
    }
    java.net.http.HttpResponse<String> trash(String id,String bearer)throws Exception{return request("DELETE","/api/v1/diaries/"+id,bearer,null);}
    java.net.http.HttpResponse<String> restore(String id,String bearer)throws Exception{return request("POST","/api/v1/diaries/"+id+"/restore",bearer,null);}
    long version(){return jdbc.queryForObject("select version from diaries",Long.class);}
    @Test void firstDeletionIsPreservedAndSharedRowsDisappearWithoutRemovingContent() throws Exception {
        String id=diary();assertThat(get("/"+id,editorToken).statusCode()).isEqualTo(200);
        var r=trash(id,token);assertThat(r.statusCode()).isEqualTo(204);assertThat(r.body()).isEmpty();assertThat(r.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(version()).isEqualTo(2);var deleted=jdbc.queryForObject("select deleted_at from diaries",Timestamp.class);var updated=jdbc.queryForObject("select updated_at from diaries",Timestamp.class);
        doReturn(now.plusSeconds(60)).when(time).now();assertThat(trash(id,token).statusCode()).isEqualTo(204);
        assertThat(jdbc.queryForObject("select deleted_at from diaries",Timestamp.class)).isEqualTo(deleted);assertThat(jdbc.queryForObject("select updated_at from diaries",Timestamp.class)).isEqualTo(updated);assertThat(version()).isEqualTo(2);
        for(String who:List.of(token,editorToken)){assertThat(get("/"+id,who).statusCode()).isEqualTo(404);assertThat(json.readTree(get("",who).body()).path("items").size()).isZero();}
        assertThat(json.readTree(get("?status=trashed",editorToken).body()).path("items").size()).isZero();
        var page=get("?status=trashed",token);var row=json.readTree(page.body()).path("items").get(0);
        assertThat(row.path("deletedAt").asText()).isEqualTo(now.toString());assertThat(row.path("expiresAt").asText()).isEqualTo(now.plus(30,ChronoUnit.DAYS).toString());assertThat(row.path("permissions").path("canRestore").asBoolean()).isTrue();
        assertThat(count("pages")).isEqualTo(1);assertThat(count("diary_members")).isEqualTo(2);assertThat(jdbc.queryForObject("select is_favorite from diary_members where user_id=?",Boolean.class,editor)).isTrue();
        String out=System.getenv("DIO_DIARY_TRASH_CONTRACT_OUTPUT");if(out!=null)java.nio.file.Files.writeString(java.nio.file.Path.of(out),page.body());
    }
    @Test void restorePreservesContentsAndRepeatDoesNotIncrementVersionAgain()throws Exception {
        String id=diary();String before=get("/"+id,token).body();trash(id,token);doReturn(now.plusSeconds(60)).when(time).now();var r=restore(id,token);assertThat(r.statusCode()).isEqualTo(200);
        var row=json.readTree(r.body()).path("diary");assertThat(row.path("deletedAt").isNull()).isTrue();assertThat(row.path("expiresAt").isNull()).isTrue();assertThat(row.path("version").asText()).isEqualTo("3");
        for(String key:List.of("diaryTitle","coverColor","coverStyle","firstPageId","pageCount","visibility","myMembership","createdAt"))assertThat(row.path(key)).isEqualTo(json.readTree(before).path("diary").path(key));
        assertThat(restore(id,token).body()).isEqualTo(r.body());assertThat(version()).isEqualTo(3);assertThat(get("/"+id,editorToken).statusCode()).isEqualTo(200);
        assertThat(json.readTree(get("?status=trashed",token).body()).path("items").size()).isZero();
        assertThat(request("PATCH","/api/v1/diaries/"+id,token,"{\"expectedVersion\":\"1\",\"diaryTitle\":\"stale\"}").statusCode()).isEqualTo(409);
        String out=System.getenv("DIO_DIARY_RESTORE_CONTRACT_OUTPUT");if(out!=null)java.nio.file.Files.writeString(java.nio.file.Path.of(out),r.body());
    }
    @Test void expiresAtExactThirtyDayBoundaryAndReadPermissionAgrees()throws Exception {
        String id=diary();trash(id,token);doReturn(now.plus(30,ChronoUnit.DAYS)).when(time).now();
        var r=restore(id,token);assertThat(r.statusCode()).isEqualTo(410);assertThat(r.body()).contains("DIARY_RESTORE_EXPIRED");assertThat(version()).isEqualTo(2);
        assertThat(json.readTree(get("?status=trashed",token).body()).path("items").get(0).path("permissions").path("canRestore").asBoolean()).isFalse();
        assertThat(trash(id,token).statusCode()).isEqualTo(204);assertThat(jdbc.queryForObject("select deleted_at from diaries",Timestamp.class).toInstant()).isEqualTo(now);
        doReturn(now.plus(31,ChronoUnit.DAYS)).when(time).now();assertThat(restore(id,token).statusCode()).isEqualTo(410);
    }
    @Test void oneMicrosecondBeforeExpiryCanRestoreAndNewCycleStartsNewDeadline()throws Exception {
        String id=diary();trash(id,token);Instant justBefore=now.plus(30,ChronoUnit.DAYS).minusNanos(1000);doReturn(justBefore).when(time).now();assertThat(restore(id,token).statusCode()).isEqualTo(200);
        Instant later=now.plus(31,ChronoUnit.DAYS);doReturn(later).when(time).now();assertThat(trash(id,token).statusCode()).isEqualTo(204);assertThat(jdbc.queryForObject("select deleted_at from diaries",Timestamp.class).toInstant()).isEqualTo(later);assertThat(version()).isEqualTo(4);
    }
    @Test void editorsForbiddenAndNonmembersLeftOrMalformedOwnerMembershipHidden()throws Exception {
        String id=diary();for(boolean deleted:List.of(false,true)){
            if(deleted)trash(id,token);assertThat(trash(id,editorToken).statusCode()).isEqualTo(403);assertThat(restore(id,editorToken).statusCode()).isEqualTo(403);
        }
        jdbc.update("update diary_members set left_at=current_timestamp where user_id=?",editor);assertThat(trash(id,editorToken).statusCode()).isEqualTo(404);assertThat(restore(id,editorToken).statusCode()).isEqualTo(404);
        jdbc.update("delete from diary_members where user_id=?",editor);assertThat(trash(id,editorToken).statusCode()).isEqualTo(404);
        jdbc.update("update diary_members set role='VIEWER' where user_id=?",owner);assertThat(restore(id,token).statusCode()).isEqualTo(404);
        assertThat(version()).isEqualTo(2);
    }
    @Test void authInvalidInputAndPermanentDeleteNeverBypassPolicy()throws Exception {
        String id=diary();assertThat(trash(id,null).statusCode()).isEqualTo(401);assertThat(restore(id,null).statusCode()).isEqualTo(401);
        assertThat(trash("bad",token).statusCode()).isEqualTo(400);assertThat(restore("bad",token).statusCode()).isEqualTo(400);
        assertThat(trash(UUID.randomUUID().toString(),token).statusCode()).isEqualTo(404);assertThat(restore(UUID.randomUUID().toString(),token).statusCode()).isEqualTo(404);
        assertThat(trash(id+"?permanent=true",token).statusCode()).isEqualTo(409);assertThat(trash(id+"?permanent=wrong",token).statusCode()).isEqualTo(400);
        for(String method:List.of("DELETE","POST")){
            String path="/api/v1/diaries/"+id+(method.equals("POST")?"/restore":"");
            assertThat(request(method,path,token,"{}").statusCode()).isEqualTo(400);assertThat(request(method,path+"?unknown=1",token,null).statusCode()).isEqualTo(400);
        }assertThat(version()).isEqualTo(1);
    }
    @Test void concurrentDuplicatesChangeStateExactlyOnce()throws Exception {
        String id=diary();var pool=java.util.concurrent.Executors.newFixedThreadPool(6);
        try{for(boolean restore:List.of(false,true)){
            var start=new java.util.concurrent.CountDownLatch(1);var tasks=new ArrayList<java.util.concurrent.Future<Integer>>();
            for(int n=0;n<6;n++)tasks.add(pool.submit(()->{start.await();return (restore?restore(id,token):trash(id,token)).statusCode();}));
            start.countDown();for(var task:tasks)assertThat(task.get(20,java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(restore?200:204);
            assertThat(version()).isEqualTo(restore?3:2);
        }}finally{pool.shutdownNow();}
    }
    @Test void versionOverflowDoesNotPartiallyDeleteOrRestore()throws Exception {
        String id=diary();jdbc.update("update diaries set version=9223372036854775807");assertThat(trash(id,token).statusCode()).isEqualTo(409);assertThat(get("/"+id,token).statusCode()).isEqualTo(200);
        jdbc.update("update diaries set deleted_at=?",Timestamp.from(now));assertThat(trash(id,token).statusCode()).isEqualTo(204);assertThat(restore(id,token).statusCode()).isEqualTo(409);assertThat(get("/"+id,token).statusCode()).isEqualTo(404);
    }
    @Test void legacyOwnerFallbackAndTransferUseActualOwner()throws Exception {
        String id=diary();jdbc.update("delete from diary_members where user_id=?",owner);assertThat(trash(id,token).statusCode()).isEqualTo(204);assertThat(restore(id,token).statusCode()).isEqualTo(200);
        jdbc.update("update diaries set owner_user_id=?",editor);assertThat(trash(id,token).statusCode()).isEqualTo(404);assertThat(trash(id,editorToken).statusCode()).isEqualTo(204);
    }
    @Test void documentsBothOperationsAndCors()throws Exception {
        String id=diary();var r=request("OPTIONS","/api/v1/diaries/"+id,null,null,"Origin","http://localhost:8081","Access-Control-Request-Method","DELETE","Access-Control-Request-Headers","authorization");assertThat(r.statusCode()).isEqualTo(200);
        var paths=json.readTree(request("GET","/v3/api-docs",null,null).body()).path("paths");
        assertThat(paths.path("/api/v1/diaries/{diaryId}").path("delete").path("parameters").toString()).contains("permanent");
        assertThat(paths.path("/api/v1/diaries/{diaryId}").path("delete").path("responses").has("204")).isTrue();assertThat(paths.path("/api/v1/diaries/{diaryId}/restore").path("post").path("responses").has("410")).isTrue();
    }
}
