package com.f106.DIO.diary;

import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class DiaryUpdateHttpTests extends DiaryHttpTestSupport {
    String newDiary() throws Exception {
        var result=create(UUID.randomUUID().toString(),input("Original","portrait"),token);
        assertThat(result.statusCode()).isEqualTo(201);
        assertThat(json.readTree(result.body()).path("diary").path("version").asText()).isEqualTo("1");
        return json.readTree(result.body()).path("diary").path("diaryId").asText();
    }
    java.net.http.HttpResponse<String> patch(String id,String body,String bearer) throws Exception {return request("PATCH","/api/v1/diaries/"+id,bearer,body);}
    String title(String version){return "{\"expectedVersion\":\""+version+"\",\"diaryTitle\":\"  Changed  \"}";}
    @Test void ownerPartialUpdateIncrementsVersionAndPreservesPagesAndMembership() throws Exception {
        String id=newDiary();var before=json.readTree(get("/"+id,token).body()).path("diary");
        var result=patch(id,title("1"),token);assertThat(result.statusCode()).isEqualTo(200);
        var row=json.readTree(result.body()).path("diary");assertThat(row.path("version").isString()).isTrue();assertThat(row.path("version").asText()).isEqualTo("2");
        assertThat(row.path("diaryTitle").asText()).isEqualTo("Changed");
        for(String key:List.of("coverColor","coverStyle","visibility","firstPageId","createdAt","myMembership"))assertThat(row.path(key)).isEqualTo(before.path(key));
        assertThat(count("pages")).isEqualTo(1);assertThat(count("diary_members")).isEqualTo(1);
        assertThat(result.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(json.readTree(get("",token).body()).path("items").get(0).path("version").asText()).isEqualTo("2");
        String output=System.getenv("DIO_DIARY_UPDATE_CONTRACT_OUTPUT");if(output!=null)java.nio.file.Files.writeString(java.nio.file.Path.of(output),result.body());
    }
    @Test void editorForbiddenAndNonMembersLeftMembersDeletedOrMissingAreHidden() throws Exception {
        String id=newDiary();String body=title("1");
        assertThat(patch(id,body,null).statusCode()).isEqualTo(401);assertThat(patch(id,body,editorToken).statusCode()).isEqualTo(404);
        jdbc.update("insert into diary_members(diary_id,user_id,role,member_color,is_favorite,joined_at) values(?,?,'EDITOR','#CED9EE',false,current_timestamp)",UUID.fromString(id),editor);
        assertThat(patch(id,title("99"),editorToken).statusCode()).isEqualTo(403);
        jdbc.update("update diary_members set left_at=current_timestamp where user_id=?",editor);
        assertThat(patch(id,body,editorToken).statusCode()).isEqualTo(404);
        jdbc.update("update diaries set deleted_at=current_timestamp");assertThat(patch(id,body,token).statusCode()).isEqualTo(404);
        assertThat(patch(UUID.randomUUID().toString(),body,token).statusCode()).isEqualTo(404);
        assertThat(patch("bad",body,token).statusCode()).isEqualTo(400);
    }
    @Test void strictInputRejectsNullUnknownNumericVersionsAndOverflowWithoutMutation() throws Exception {
        String id=newDiary();
        for(String value:List.of("null","1","1.0","true","\"0\"","\"01\"","\"-1\"","\"9223372036854775808\"","\"1e0\""))
            assertThat(patch(id,"{\"diaryTitle\":\"x\",\"expectedVersion\":"+value+"}",token).statusCode()).as(value).isEqualTo(400);
        for(String fields:List.of("",",\"diaryTitle\":null",",\"diaryTitle\":42",",\"diaryTitle\":\"  \"",",\"coverColor\":null",",\"coverColor\":\"blue\"",",\"coverStyle\":\"bad\"",",\"visibility\":\"MEMBERS\"",",\"isFavorite\":true",",\"ownerUserId\":1",",\"pages\":[]"))
            assertThat(patch(id,"{\"expectedVersion\":\"1\""+fields+"}",token).statusCode()).as(fields).isEqualTo(400);
        assertThat(patch(id,"{\"diaryTitle\":\"x\"}",token).statusCode()).isEqualTo(400);
        assertThat(json.readTree(get("/"+id,token).body()).path("diary").path("version").asText()).isEqualTo("1");
    }
    @Test void staleOrRepeatedWriteCannotChangeTheDiaryTwice() throws Exception {
        String id=newDiary();assertThat(patch(id,title("1"),token).statusCode()).isEqualTo(200);
        var before=get("/"+id,token).body();var retry=patch(id,title("1"),token);
        assertThat(retry.statusCode()).isEqualTo(409);assertThat(retry.body()).contains("VERSION_CONFLICT");assertThat(get("/"+id,token).body()).isEqualTo(before);
    }
    @Test void simultaneousSameVersionHasExactlyOneWinner() throws Exception {
        String id=newDiary();var pool=java.util.concurrent.Executors.newFixedThreadPool(6);
        try {var start=new java.util.concurrent.CountDownLatch(1);var tasks=new ArrayList<java.util.concurrent.Future<Integer>>();
            for(int n=0;n<6;n++)tasks.add(pool.submit(()->{start.await();return patch(id,title("1"),token).statusCode();}));
            start.countDown();var statuses=new ArrayList<Integer>();for(var task:tasks)statuses.add(task.get(20,java.util.concurrent.TimeUnit.SECONDS));
            assertThat(Collections.frequency(statuses,200)).isEqualTo(1);assertThat(Collections.frequency(statuses,409)).isEqualTo(5);
        }finally{pool.shutdownNow();}
    }
    @Test void bigintPrecisionAndMaximumAreHandledWithoutOverflow() throws Exception {
        String id=newDiary();jdbc.update("update diaries set version=9007199254740993");
        var result=patch(id,title("9007199254740993"),token);assertThat(result.statusCode()).isEqualTo(200);
        assertThat(json.readTree(result.body()).path("diary").path("version").asText()).isEqualTo("9007199254740994");
        jdbc.update("update diaries set version=9223372036854775807");assertThat(patch(id,title("9223372036854775807"),token).body()).contains("VERSION_EXHAUSTED");
    }
    @Test void ownerMembershipRevocationAndTransferAreRechecked() throws Exception {
        String id=newDiary();jdbc.update("update diary_members set left_at=current_timestamp where user_id=?",owner);
        assertThat(patch(id,title("1"),token).statusCode()).isEqualTo(404);
        jdbc.update("update diary_members set left_at=null,role='EDITOR' where user_id=?",owner);jdbc.update("update diaries set owner_user_id=?",editor);
        assertThat(patch(id,title("1"),token).statusCode()).isEqualTo(403);
    }
    @Test void patchCorsAndOpenApiExposeRequiredStringVersion() throws Exception {
        String id=newDiary();var cors=request("OPTIONS","/api/v1/diaries/"+id,null,null,"Origin","http://localhost:8081","Access-Control-Request-Method","PATCH","Access-Control-Request-Headers","authorization,content-type");
        assertThat(cors.statusCode()).isEqualTo(200);
        var spec=json.readTree(request("GET","/v3/api-docs",null,null).body());var schema=spec.path("components").path("schemas").path("AccountDiaryUpdateRequest");
        assertThat(schema.path("required").toString()).contains("expectedVersion");assertThat(schema.path("properties").path("expectedVersion").path("type").asText()).isEqualTo("string");
        assertThat(schema.path("properties").has("anyFieldPresent")).isFalse();
        assertThat(spec.path("paths").path("/api/v1/diaries/{diaryId}").path("patch").path("responses").has("409")).isTrue();
    }
    @Test void unicodeWhitespacePatchCannotPoisonTheListContract() throws Exception {
        String id=newDiary();
        for(String white:List.of("\u00a0","\u2007","\u202f","\ufeff","\u3000","\u2028","\u2029")) {
            String body=json.writeValueAsString(Map.of("expectedVersion","1","diaryTitle",white));
            assertThat(patch(id,body,token).statusCode()).isEqualTo(400);
        }
        assertThat(jdbc.queryForObject("select version from diaries",Long.class)).isEqualTo(1);
        var r=patch(id,json.writeValueAsString(Map.of("expectedVersion","1","diaryTitle","\ufeff\u00a0 Changed \u2007")),token);
        assertThat(r.statusCode()).isEqualTo(200);assertThat(json.readTree(r.body()).path("diary").path("diaryTitle").asText()).isEqualTo("Changed");
        assertThat(json.readTree(get("",token).body()).path("items").get(0).path("diaryTitle").asText()).isEqualTo("Changed");
    }
}
