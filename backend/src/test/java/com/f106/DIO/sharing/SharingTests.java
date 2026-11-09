package com.f106.DIO.sharing;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.dto.LoginRequest;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.service.EmailLoginService;
import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.repository.*;
import com.f106.DIO.sharing.service.*;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class SharingTests extends SharingTestSupport {
    @Test void previewReturnsStoredCoverAndFirstActivePageOrientation() throws Exception {
        var owner=actor();
        var id=diary(owner);
        var token=links.create(id,owner.id()).token();
        mvc.perform(get("/api/v1/invites/"+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pageSize").value("landscape"));

        jdbc.update("update diaries set cover_color=?,cover_style=?,cover_json=? where diary_id=?",
            "#ABCDEF","GRID","{\"kind\":\"plain\"}",id);
        for (int index=0;index<3;index++) {
            boolean portrait=index==1;
            jdbc.update("""
                insert into pages(page_id,diary_id,sort_key,canvas_width,canvas_height,grid_visible,version,created_at,updated_at,deleted_at)
                values(?,?,?,?,?,false,1,current_timestamp,current_timestamp,?)
                """,UUID.randomUUID(),id,index+1,portrait?768:1024,portrait?1024:768,
                index==0?java.sql.Timestamp.from(Instant.now()):null);
        }
        mvc.perform(get("/api/v1/invites/"+token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pageSize").value("portrait"))
            .andExpect(jsonPath("$.coverColor").value("#ABCDEF"))
            .andExpect(jsonPath("$.coverStyle").value("GRID"))
            .andExpect(jsonPath("$.cover.kind").value("plain"));
    }

    @Test void previewReturnsOriginalCoverAndOnlyItsImagesUntilLinkIsRevoked() throws Exception {
        var owner = actor();
        var outsider = actor();
        var id = diary(owner);
        byte[] png = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=");
        var upload = new org.springframework.mock.web.MockMultipartFile("file", "cover.png", "image/png", png);
        var media = mvc.perform(multipart("/api/v1/media").file(upload).header("Authorization", "Bearer " + owner.token()))
            .andExpect(status().isCreated()).andReturn();
        String mediaId = new tools.jackson.databind.json.JsonMapper().readTree(media.getResponse().getContentAsString())
            .path("mediaFileId").asText();
        jdbc.update("update diaries set cover_json=? where diary_id=?", """
            {"kind":"photo","color":"#ABCDEF","photo":{"mediaFileId":"%1$s","src":"media:%1$s"},
             "stickers":[{"mediaFileId":"%1$s","src":"media:%1$s"}],"title":{"text":"Cover title"},
             "ribbon":{"color":"#ABCDEF"},"band":{"on":false}}
            """.formatted(mediaId), id);

        String linkToken = links.create(id, owner.id()).token();
        String invitePath = "/api/v1/invites/" + linkToken;
        mvc.perform(get(invitePath).header("Authorization", "Bearer " + outsider.token()))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "private, no-store"))
            .andExpect(jsonPath("$.cover.kind").value("photo"))
            .andExpect(jsonPath("$.cover.photo.mediaFileId").value(mediaId))
            .andExpect(jsonPath("$.cover.stickers[0].mediaFileId").value(mediaId))
            .andExpect(jsonPath("$.cover.title.text").value("Cover title"))
            .andExpect(jsonPath("$.cover.ribbon.color").value("#ABCDEF"))
            .andExpect(jsonPath("$.cover.band.on").value(false));

        String imagePath = invitePath + "/cover-media/" + mediaId;
        mvc.perform(get(imagePath)).andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "private, no-store"))
            .andExpect(content().contentType("image/png")).andExpect(content().bytes(png));
        mvc.perform(get(invitePath + "/cover-media/" + UUID.randomUUID())).andExpect(status().isNotFound());

        var recipient = actor();
        String email = users.findById(recipient.id()).orElseThrow().getEmail();
        mvc.perform(post("/api/v1/diaries/" + id + "/invites/email")
                .header("Authorization", "Bearer " + owner.token())
                .contentType("application/json").content("{\"email\":\"" + email + "\"}"))
            .andExpect(status().isAccepted());
        String emailPath = "/api/v1/invites/" + tokenSigner.token(invites.pendingEmail(id, recipient.id()).orElseThrow());
        mvc.perform(get(emailPath).header("Authorization", "Bearer " + recipient.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.cover.photo.mediaFileId").value(mediaId));
        String emailImagePath = emailPath + "/cover-media/" + mediaId;
        mvc.perform(get(emailImagePath)).andExpect(status().isUnauthorized());
        mvc.perform(get(emailImagePath).header("Authorization", "Bearer " + outsider.token()))
            .andExpect(status().isForbidden());
        mvc.perform(get(emailImagePath).header("Authorization", "Bearer " + recipient.token()))
            .andExpect(status().isOk()).andExpect(content().bytes(png));

        var expired = invites.saveAndFlush(new com.f106.DIO.sharing.domain.DiaryInvite(
            id, owner.id(), Instant.now().minusSeconds(3601).truncatedTo(java.time.temporal.ChronoUnit.MICROS)));
        String expiredToken = tokenSigner.token(expired);
        expired.initializeHash(tokenSigner.hash(expiredToken));
        invites.saveAndFlush(expired);
        mvc.perform(get("/api/v1/invites/" + expiredToken + "/cover-media/" + mediaId))
            .andExpect(status().isGone()).andExpect(jsonPath("code").value("INVITE_EXPIRED"));

        jdbc.update("update diary_invites set max_uses=1,use_count=1 where invite_id=?", tokenSigner.id(linkToken));
        mvc.perform(get(invitePath)).andExpect(status().isOk())
            .andExpect(jsonPath("$.cover.kind").value("plain"));
        mvc.perform(get(imagePath)).andExpect(status().isNotFound());
        jdbc.update("update diary_invites set use_count=0 where invite_id=?", tokenSigner.id(linkToken));

        jdbc.update("update diaries set cover_json=? where diary_id=?", "{}", id);
        mvc.perform(get(imagePath)).andExpect(status().isNotFound());
        links.create(id, owner.id());
        mvc.perform(get(imagePath)).andExpect(status().isGone());
    }

    @Test void protectedEndpointsRejectMissingAndInvalidToken() throws Exception {
        var id=UUID.randomUUID();
        mvc.perform(get("/api/v1/diaries/"+id+"/members")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/invites/invalid/accept").header("Authorization","Bearer bad")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/invites/invalid")).andExpect(status().isNotFound());
    }
    @Test void currentLinkRegenerationInvalidatesOldAndSharedQuotaCountsAllActors() throws Exception {
        var owner=actor();var editor=actor();var id=diary(owner);
        assertThat(links.current(id,owner.id()).available()).isFalse();
        var first=links.create(id,owner.id());
        assertThat(links.current(id,owner.id()).token()).isEqualTo(first.token());
        mvc.perform(get("/api/v1/invites/"+first.token())).andExpect(status().isOk()).andExpect(jsonPath("currentMembers").value(1));
        links.accept(first.token(),editor.id());
        var second=links.create(id,editor.id());
        assertThatThrownBy(()->links.preview(first.token())).isInstanceOfSatisfying(SharingException.class,e->assertThat(e.code).isEqualTo("INVITE_REVOKED"));
        var third=links.create(id,owner.id());
        mvc.perform(post("/api/v1/diaries/"+id+"/invites").header("Authorization","Bearer "+editor.token()))
            .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
        assertThat(links.current(id,owner.id()).token()).isEqualTo(third.token());
        assertThat(diaries.findById(id).orElseThrow().getVisibility()).isEqualTo("MEMBERS");
        assertThat(links.accept(third.token(),editor.id()).alreadyMember()).isTrue();
        assertThat(invites.findById(Long.parseLong(third.token().split("[.]")[0])).orElseThrow().getUseCount()).isZero();
    }
    @Test void onlyMemberCanListOrUpdateAndOnlyOwnerCanKick() throws Exception {
        var owner=actor();var editor=actor();var outsider=actor();var id=diary(owner);
        var link=links.create(id,owner.id());links.accept(link.token(),editor.id());
        mvc.perform(get("/api/v1/diaries/"+id+"/members").header("Authorization","Bearer "+outsider.token())).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/diaries/"+id+"/membership").header("Authorization","Bearer "+editor.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"favorite\":true}"))
            .andExpect(status().isOk()).andExpect(jsonPath("favorite").value(true));
        mvc.perform(patch("/api/v1/diaries/"+id+"/membership").header("Authorization","Bearer "+editor.token())
            .contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/v1/diaries/"+id+"/members/"+owner.id()).header("Authorization","Bearer "+editor.token())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/diaries/"+id+"/members/"+editor.id()).header("Authorization","Bearer "+owner.token())).andExpect(status().isNoContent());
        assertThatThrownBy(()->membership.list(id,editor.id())).isInstanceOf(SharingException.class);
        assertThatThrownBy(()->links.accept(link.token(),editor.id())).isInstanceOfSatisfying(SharingException.class,e->assertThat(e.code).isEqualTo("INVITE_REVOKED"));
        assertThat(members.findById(new com.f106.DIO.diary.domain.DiaryMemberId(id,editor.id())).orElseThrow().getLeftAt()).isNotNull();
    }
    @Test void ownerTransfersAndRemainsAnEditorUntilExplicitLeave() throws Exception {
        var owner=actor();var editor=actor();var id=diary(owner);var link=links.create(id,owner.id());links.accept(link.token(),editor.id());
        mvc.perform(delete("/api/v1/diaries/"+id+"/members/"+owner.id()).header("Authorization","Bearer "+owner.token())).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/diaries/"+id+"/transfer-owner").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"newOwnerUserId\":"+editor.id()+"}" )).andExpect(status().isNoContent());
        assertThat(diaries.findById(id).orElseThrow().getOwnerUserId()).isEqualTo(editor.id());
        assertThat(membership.list(id,editor.id()).currentMembers()).isEqualTo(2);
        assertThat(membership.list(id,owner.id()).members()).filteredOn(m->m.userId().equals(Long.toString(owner.id()))).extracting(m->m.role()).containsExactly("EDITOR");
        membership.remove(id,owner.id(),owner.id());
        assertThat(membership.list(id,editor.id()).currentMembers()).isEqualTo(1);
        assertThat(links.create(id,editor.id()).available()).isTrue();
    }
    @Test void expiredAndTamperedLinksCannotBeUsed() throws Exception {
        var owner=actor();var guest=actor();var id=diary(owner);var link=links.create(id,owner.id());
        String altered=link.token().substring(0,link.token().length()-1)+(link.token().endsWith("A")?"B":"A");
        mvc.perform(get("/api/v1/invites/"+altered)).andExpect(status().isNotFound());
        var expired=invites.saveAndFlush(new com.f106.DIO.sharing.domain.DiaryInvite(id,owner.id(),Instant.now().minusSeconds(3601).truncatedTo(java.time.temporal.ChronoUnit.MICROS)));
        String expiredToken=tokenSigner.token(expired);expired.initializeHash(tokenSigner.hash(expiredToken));invites.saveAndFlush(expired);
        mvc.perform(get("/api/v1/invites/"+expiredToken)).andExpect(status().isGone()).andExpect(jsonPath("code").value("INVITE_EXPIRED"));
        assertThatThrownBy(()->ownership.transfer(id,owner.id(),guest.id())).isInstanceOf(SharingException.class);
    }
    @Test void guestDiaryCannotBeClaimedByAnyLoggedInCaller(){
        var actor=actor();var diary=diaries.saveAndFlush(new Diary(UUID.randomUUID(),"비회원","#CED9EE","PLAIN","PRIVATE"));
        assertThatThrownBy(()->links.create(diary.getDiaryId(),actor.id())).isInstanceOf(SharingException.class);
        assertThat(diaries.findById(diary.getDiaryId()).orElseThrow().getOwnerUserId()).isNull();
    }
    @Test void editorLeavePreservesSharedDiaryAndCanRejoin(){
        var owner=actor();var editor=actor();var id=diary(owner);var link=links.create(id,owner.id());
        links.accept(link.token(),editor.id());membership.remove(id,editor.id(),editor.id());
        assertThat(diaries.findById(id).orElseThrow().getVisibility()).isEqualTo("MEMBERS");
        assertThat(membership.list(id,owner.id()).currentMembers()).isEqualTo(1);
        assertThat(links.accept(link.token(),editor.id()).currentMembers()).isEqualTo(2);
    }
    @Test void swaggerListsEightSharingRoutesWithCorrectSecurityAndNoContentCodes() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/membership'].patch").exists())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/members'].get.security[0].bearerAuth").exists())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/members/{userId}'].delete.responses['204']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/transfer-owner'].post.responses['204']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/invites'].get").exists())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/invites'].post.responses['201']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/invites/{token}'].get.security").doesNotExist())
            .andExpect(jsonPath("$.paths['/api/v1/invites/{token}/accept'].post.security[0].bearerAuth").exists())
            .andExpect(jsonPath("$.components.schemas.DiaryProfileUpdateRequest.properties.notEmpty").doesNotExist());
    }
    @Test void parallelGenerationRespectsDiaryWideThreeLinkQuota() throws Exception {
        var owner=actor();var id=diary(owner);var start=new CountDownLatch(1);var ready=new CountDownLatch(6);
        var pool=Executors.newFixedThreadPool(6);
        try {
            List<Future<Boolean>> results=new ArrayList<>();
            for(int i=0;i<6;i++)results.add(pool.submit(()->{ready.countDown();start.await();try{links.create(id,owner.id());return true;}catch(SharingException e){assertThat(e.code).isEqualTo("INVITE_RATE_LIMITED");return false;}}));
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();start.countDown();int created=0;
            for(var result:results)if(result.get(30,TimeUnit.SECONDS))created++;
            assertThat(created).isEqualTo(3);
            assertThat(jdbc.queryForObject("select count(*) from diary_invites where diary_id=? and revoked_at is null",Integer.class,id)).isEqualTo(1);
        }finally{start.countDown();pool.shutdownNow();}
    }
    @Test void concurrentAcceptNeverExceedsFourIncludingOwner() throws Exception {
        var owner=actor();var id=diary(owner);var link=links.create(id,owner.id());
        List<Actor> actors=new ArrayList<>();for(int i=0;i<7;i++)actors.add(actor());
        var ready=new CountDownLatch(actors.size());var go=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(actors.size());
        try {
            List<Future<Boolean>> results=new ArrayList<>();
            for(var actor:actors)results.add(pool.submit(()->{ready.countDown();go.await();try{links.accept(link.token(),actor.id());return true;}catch(SharingException e){assertThat(e.code).isEqualTo("DIARY_MEMBER_LIMIT_REACHED");return false;}}));
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();go.countDown();int accepted=0;
            for(var result:results)if(result.get(30,TimeUnit.SECONDS))accepted++;
            assertThat(accepted).isEqualTo(3);assertThat(membership.list(id,owner.id()).currentMembers()).isEqualTo(4);
        }finally{go.countDown();pool.shutdownNow();}
    }
}
