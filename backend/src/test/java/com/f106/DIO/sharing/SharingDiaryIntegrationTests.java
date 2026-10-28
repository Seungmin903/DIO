package com.f106.DIO.sharing;
import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class SharingDiaryIntegrationTests extends SharingTestSupport {
    @org.junit.jupiter.api.BeforeEach void memberReceiptFixture() {
        // JDBC-only develop table: Hibernate does not create this existing migration table in H2.
        jdbc.execute("create table if not exists diary_creation_receipts(user_id bigint,key_hash char(64),request_hash char(64),diary_id uuid,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
    }
    UUID createThroughApi(Actor actor) throws Exception {
        String response=mvc.perform(post("/api/v1/diaries").header("Authorization","Bearer "+actor.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"diaryTitle\":\"공유 통합 테스트\"}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(response,"$.diary.diaryId"));
    }
    @Test void authenticatedCreationInvitationAndKickUseTheSameMembershipForPageAccess() throws Exception {
        var owner=actor();var editor=actor();UUID id=createThroughApi(owner);
        assertThat(diaries.findById(id).orElseThrow().getOwnerUserId()).isEqualTo(owner.id());
        String response=mvc.perform(post("/api/v1/diaries/"+id+"/invites").header("Authorization","Bearer "+owner.token()))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String token=JsonPath.read(response,"$.token");
        mvc.perform(post("/api/v1/invites/"+token+"/accept").header("Authorization","Bearer "+editor.token())).andExpect(status().isOk());
        String pageResponse=mvc.perform(post("/api/v1/diaries/"+id+"/pages").header("Authorization","Bearer "+editor.token())
            .contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String page=JsonPath.read(pageResponse,"$.page.pageId");
        mvc.perform(delete("/api/v1/diaries/"+id+"/members/"+editor.id()).header("Authorization","Bearer "+owner.token())).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/pages/"+page).header("Authorization","Bearer "+editor.token())).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/pages/"+page).header("Authorization","Bearer "+owner.token())).andExpect(status().isOk());
    }
    @Test void transferKeepsFormerOwnerAsEditorForContentButRemovesOwnerOnlyPermission() throws Exception {
        var owner=actor();var successor=actor();var id=createThroughApi(owner);links.accept(links.create(id,owner.id()).token(),successor.id());
        ownership.transfer(id,owner.id(),successor.id());
        mvc.perform(post("/api/v1/diaries/"+id+"/pages").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().isCreated());
        mvc.perform(delete("/api/v1/diaries/"+id).header("Authorization","Bearer "+owner.token())).andExpect(status().isForbidden());
        assertThat(membership.list(id,successor.id()).currentMembers()).isEqualTo(2);
    }
}
