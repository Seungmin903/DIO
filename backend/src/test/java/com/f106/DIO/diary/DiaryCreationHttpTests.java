package com.f106.DIO.diary;

import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.dto.LoginResponse;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import static org.assertj.core.api.Assertions.assertThat;

class DiaryCreationHttpTests extends DiaryHttpTestSupport {
    @Test void createsOwnerDiaryMembershipAndExactlyOneBlankPageAtomically() throws Exception {
        for(String direction:List.of("landscape","portrait")){
            var r=create(UUID.randomUUID().toString(),input("  My diary  ",direction),token);
            assertThat(r.statusCode()).isEqualTo(201);var body=json.readTree(r.body());var row=body.path("diary");UUID diary=UUID.fromString(row.path("diaryId").asText());
            assertThat(row.path("myRole").asText()).isEqualTo("OWNER");assertThat(row.path("visibility").asText()).isEqualTo("PRIVATE");
            assertThat(row.path("diaryTitle").asText()).isEqualTo("My diary");assertThat(row.path("coverColor").asText()).isEqualTo("#AABBCC");
            assertThat(row.path("pageCount").asInt()).isEqualTo(1);assertThat(row.path("firstPageId").asText()).isEqualTo(body.path("firstPageId").asText());
            assertThat(jdbc.queryForObject("select owner_user_id from diaries where diary_id=?",Long.class,diary)).isEqualTo(owner);
            assertThat(jdbc.queryForObject("select role from diary_members where diary_id=? and user_id=?",String.class,diary,owner)).isEqualTo("OWNER");
            assertThat(jdbc.queryForObject("select canvas_width from pages where diary_id=?",Integer.class,diary)).isEqualTo(direction.equals("portrait")?800:1280);
            assertThat(jdbc.queryForObject("select canvas_height from pages where diary_id=?",Integer.class,diary)).isEqualTo(direction.equals("portrait")?1280:800);
            assertThat(r.headers().firstValue("Location").orElse("")).isEqualTo("/api/v1/diaries/"+diary);
            assertThat(r.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
            assertThat(get("/"+diary,editorToken).statusCode()).isEqualTo(404);
            String output=System.getenv("DIO_DIARY_CREATE_CONTRACT_OUTPUT");if(output!=null)java.nio.file.Files.writeString(java.nio.file.Path.of(output),r.body());
        }
        assertThat(count("diaries")).isEqualTo(2);assertThat(count("pages")).isEqualTo(2);assertThat(count("diary_members")).isEqualTo(2);assertThat(count("diary_creation_requests")).isEqualTo(2);
    }
    @Test void replaysExactResponseAndLocationWithoutExtendingExpiry() throws Exception {
        String key=UUID.randomUUID().toString();var first=create(key,input("  Same  ","portrait"),token);
        var expiry=jdbc.queryForObject("select expires_at from diary_creation_requests",java.sql.Timestamp.class);
        var created=jdbc.queryForObject("select created_at from diary_creation_requests",java.sql.Timestamp.class);
        assertThat(java.time.Duration.between(created.toInstant(),expiry.toInstant()).toSeconds()).isEqualTo(86400);
        var second=create(key,input("Same","portrait").replace("aabbcc","AABBCC"),token);
        assertThat(second.statusCode()).isEqualTo(201);assertThat(second.body()).isEqualTo(first.body());assertThat(second.headers().firstValue("Location")).isEqualTo(first.headers().firstValue("Location"));
        assertThat(jdbc.queryForObject("select expires_at from diary_creation_requests",java.sql.Timestamp.class)).isEqualTo(expiry);
        assertThat(count("diaries")).isEqualTo(1);
    }
    @Test void sameKeyDifferentInputConflictsButDifferentAccountsAreIndependent() throws Exception {
        String key=UUID.randomUUID().toString();assertThat(create(key,input("A","landscape"),token).statusCode()).isEqualTo(201);
        var conflict=create(key,input("B","landscape"),token);assertThat(conflict.statusCode()).isEqualTo(409);assertThat(conflict.body()).contains("IDEMPOTENCY_KEY_CONFLICT");
        assertThat(create(key,input("A","portrait"),token).statusCode()).isEqualTo(409);
        assertThat(create(key,input("B","portrait"),editorToken).statusCode()).isEqualTo(201);assertThat(count("diaries")).isEqualTo(2);
    }
    @Test void expiredKeyRemainsATombstoneAfterResponseCleanup() throws Exception {
        String key=UUID.randomUUID().toString();create(key,input("A","landscape"),token);
        jdbc.update("update diary_creation_requests set created_at=?,expires_at=?",java.sql.Timestamp.from(Instant.now().minusSeconds(172800)),java.sql.Timestamp.from(Instant.now().minusSeconds(86400)));
        assertThat(create(key,input("A","landscape"),token).body()).contains("IDEMPOTENCY_KEY_EXPIRED");
        assertThat(creation.purgeExpiredResponses()).isEqualTo(1);assertThat(creation.purgeExpiredResponses()).isZero();
        assertThat(jdbc.queryForObject("select response_body from diary_creation_requests",String.class)).isNull();
        assertThat(create(key,input("A","landscape"),token).statusCode()).isEqualTo(409);assertThat(count("diaries")).isEqualTo(1);assertThat(count("diary_creation_requests")).isEqualTo(1);
    }
    @Test void rejectsMissingMalformedAndUnsupportedInputsWithoutWriting() throws Exception {
        String valid=input("A","landscape");String key=UUID.randomUUID().toString();
        assertThat(request("POST","/api/v1/diaries",token,valid).statusCode()).isEqualTo(400);
        assertThat(create("bad",valid,token).statusCode()).isEqualTo(400);assertThat(create(key,valid,null).statusCode()).isEqualTo(401);
        assertThat(create(key,valid,token+"tampered").statusCode()).isEqualTo(401);
        for(String body:List.of("{}",valid.replace("\"A\"","null"),valid.replace("landscape","square"),valid.replace("BLANK","CALENDAR"),
            valid.replace("\"PLAIN\"","null"),valid.replace("#aabbcc","blue"),valid.replace("\"A\"","\""+"x".repeat(101)+"\""),
            valid.replace("\"diaryTitle\"","\"ownerUserId\""),valid.replace("\"firstPage\":{","\"firstPage\":{\"templateId\":1,"),
            valid.replace("{\"diaryTitle","{\"visibility\":\"MEMBERS\",\"diaryTitle"),valid.replace("{\"diaryTitle","{\"initialPages\":[],\"diaryTitle")))
            assertThat(create(key,body,token).statusCode()).as(body).isEqualTo(400);
        assertThat(count("diaries")).isZero();assertThat(count("pages")).isZero();assertThat(count("diary_creation_requests")).isZero();
    }
    @Test void firstPageFailureRollsBackDiaryMembershipAndReceiptAndSameKeyCanRetry() throws Exception {
        var fail=new java.util.concurrent.atomic.AtomicBoolean(true);
        org.mockito.Mockito.doAnswer(call->{Object result=call.callRealMethod();if(fail.getAndSet(false))throw new IllegalStateException("Injected after page insert");return result;})
            .when(pages).insert(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any());
        String key=UUID.randomUUID().toString();assertThat(create(key,input("A","landscape"),token).statusCode()).isEqualTo(500);
        for(String table:List.of("diaries","diary_members","pages","diary_creation_requests"))assertThat(count(table)).isZero();
        assertThat(create(key,input("A","landscape"),token).statusCode()).isEqualTo(201);assertThat(count("diaries")).isEqualTo(1);
    }
    @Test void concurrentIdenticalRequestsReturnOneCommittedResult() throws Exception {
        var pool=java.util.concurrent.Executors.newFixedThreadPool(6);String key=UUID.randomUUID().toString();
        try{var start=new java.util.concurrent.CountDownLatch(1);var tasks=new ArrayList<java.util.concurrent.Future<HttpResponse<String>>>();
            for(int i=0;i<6;i++)tasks.add(pool.submit(()->{start.await();return create(key,input("Concurrent","landscape"),token);}));
            start.countDown();var bodies=new HashSet<String>();for(var task:tasks){var r=task.get(20,java.util.concurrent.TimeUnit.SECONDS);assertThat(r.statusCode()).isEqualTo(201);bodies.add(r.body());}
            assertThat(bodies).hasSize(1);for(String table:List.of("diaries","diary_members","pages","diary_creation_requests"))assertThat(count(table)).isEqualTo(1);
        }finally{pool.shutdownNow();}
    }
    @Test void receiptFailureRollsBackEvenTheAlreadyInsertedOwnerMembership() throws Exception {
        String key=UUID.randomUUID().toString();
        jdbc.execute("alter table diary_creation_requests add constraint qa_fail_receipt check (user_id<0)");
        try {
            assertThat(create(key,input("A","landscape"),token).statusCode()).isEqualTo(500);
            for(String table:List.of("diaries","diary_members","pages","diary_creation_requests"))assertThat(count(table)).isZero();
        } finally { jdbc.execute("alter table diary_creation_requests drop constraint qa_fail_receipt"); }
        assertThat(create(key,input("A","landscape"),token).statusCode()).isEqualTo(201);
    }
    @Test void deletedResultCannotBeRecreatedByReplay() throws Exception {
        String key=UUID.randomUUID().toString();create(key,input("A","landscape"),token);jdbc.update("update diaries set deleted_at=current_timestamp");
        var r=create(key,input("A","landscape"),token);assertThat(r.statusCode()).isEqualTo(409);assertThat(r.body()).contains("CREATED_DIARY_UNAVAILABLE");assertThat(count("diaries")).isEqualTo(1);
    }
    @Test void allowsCreateCorsHeadersAndDocumentsTheActualContract() throws Exception {
        var r=request("OPTIONS","/api/v1/diaries",null,null,"Origin","http://localhost:8081","Access-Control-Request-Method","POST","Access-Control-Request-Headers","content-type,authorization,idempotency-key");
        assertThat(r.statusCode()).isEqualTo(200);assertThat(r.headers().firstValue("Access-Control-Allow-Headers").orElse("")).containsIgnoringCase("idempotency-key");
        var spec=json.readTree(request("GET","/v3/api-docs",null,null).body());assertThat(spec.path("paths").path("/api/v1/diaries").path("post").path("responses").has("409")).isTrue();
        assertThat(spec.path("components").path("schemas").path("AccountDiaryCreateRequest").path("required").size()).isEqualTo(4);
        boolean requiredKey=false;
        for(var parameter:spec.path("paths").path("/api/v1/diaries").path("post").path("parameters"))
            if(parameter.path("name").asText().equals("Idempotency-Key"))requiredKey=parameter.path("required").asBoolean();
        assertThat(requiredKey).isTrue();
    }
    @Test void unicodeWhitespaceTitleIsRejectedOrNormalizedBeforeStorage() throws Exception {
        for(String white:List.of("\u00a0","\u2007","\u202f","\ufeff","\u3000","\u2028","\u2029")) {
            var r=create(UUID.randomUUID().toString(),input(white,"landscape"),token);
            assertThat(r.statusCode()).isEqualTo(400);
        }
        assertThat(count("diaries")).isZero();assertThat(count("diary_creation_requests")).isZero();
        var r=create(UUID.randomUUID().toString(),input("\u00a0\ufeff My diary \u202f","landscape"),token);
        assertThat(r.statusCode()).isEqualTo(201);
        assertThat(json.readTree(r.body()).path("diary").path("diaryTitle").asText()).isEqualTo("My diary");
        assertThat(jdbc.queryForObject("select title from diaries",String.class)).isEqualTo("My diary");
    }
}
