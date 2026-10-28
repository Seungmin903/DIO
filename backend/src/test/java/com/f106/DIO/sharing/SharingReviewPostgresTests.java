package com.f106.DIO.sharing;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@EnabledIfEnvironmentVariable(named="DIO_SHARING_POSTGRES_QA",matches="true")
class SharingReviewPostgresTests extends SharingReviewTests {
    @Autowired PlatformTransactionManager manager;
    @Autowired tools.jackson.databind.ObjectMapper json;
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){SharingPostgresTests.database(registry);}
    @Test void readsAndForgedSignaturesDoNotWaitForTheDiaryWriteLock() throws Exception {
        var owner=actor();var id=diary(owner);String token=links.create(id,owner.id()).token();
        var pool=Executors.newFixedThreadPool(2);var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
        try {
            var writer=pool.submit(()->new TransactionTemplate(manager).execute(tx->{diaries.findForUpdate(id).orElseThrow();locked.countDown();
                try{if(!release.await(60,TimeUnit.SECONDS))throw new AssertionError("Release timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;}));
            assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
            var reader=pool.submit(()->{
                String forged=token.substring(0,token.indexOf('.'))+"."+"A".repeat(43);
                mvc.perform(get("/api/v1/invites/"+forged)).andExpect(status().isNotFound());
                assertThat(links.preview(token).currentMembers()).isEqualTo(1);
                assertThat(membership.list(id,owner.id()).currentMembers()).isEqualTo(1);
                assertThat(emails.sent(id,owner.id(),0,20).available()).isTrue();return null;
            });
            reader.get(30,TimeUnit.SECONDS);release.countDown();writer.get(10,TimeUnit.SECONDS);
        } finally {release.countDown();pool.shutdownNow();}
    }
    @Test void lastMemberCanDeleteAnApiCreatedDiaryWhileReceiptsAndMediaJobsRemainConsistent() throws Exception {
        var owner=actor();
        var template=jdbc.queryForMap("select code,template_version,default_config from page_templates where code='2026-cover-landscape' and is_active");
        String body=json.writeValueAsString(Map.of("diaryTitle","공유 삭제 검증","coverColor","#123456","coverStyle","PLAIN",
            "initialPages",List.of(Map.of("templateCode",template.get("code"),"templateVersion",template.get("template_version"),
                "templateConfig",json.readTree(template.get("default_config").toString())))));
        String response=mvc.perform(post("/api/v1/member/diaries").header("Authorization","Bearer "+owner.token())
            .header("Idempotency-Key","sharing-delete-"+UUID.randomUUID()).contentType("application/json")
            .content(body))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID id=UUID.fromString(com.jayway.jsonpath.JsonPath.read(response,"$.diary.diaryId"));
        assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts where diary_id=?",Integer.class,id)).isEqualTo(1);
        UUID media=UUID.randomUUID();
        jdbc.update("insert into media_files(media_file_id,owner_user_id,storage_key,mime_type,file_size) values(?,?,'qa-retained-source','image/png',10)",media,owner.id());
        Long job=jdbc.queryForObject("insert into ai_jobs(source_media_file_id) values(?) returning ai_job_id",Long.class,media);
        mvc.perform(delete("/api/v1/diaries/"+id+"/members/"+owner.id()).header("Authorization","Bearer "+owner.token())).andExpect(status().isNoContent());
        assertThat(diaries.findById(id)).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from pages where diary_id=?",Integer.class,id)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts where user_id=? and diary_id is null and response_body is null and completed_at is not null",Integer.class,owner.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select source_media_file_id from ai_jobs where ai_job_id=?",UUID.class,job)).isEqualTo(media);
        assertThat(jdbc.queryForObject("select count(*) from media_files where media_file_id=?",Integer.class,media)).isEqualTo(1);
    }
}
