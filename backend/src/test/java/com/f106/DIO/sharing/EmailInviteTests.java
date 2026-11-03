package com.f106.DIO.sharing;
import com.f106.DIO.sharing.dto.EmailInviteRequest;
import com.f106.DIO.sharing.service.EmailInviteService;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.domain.DiaryInvite;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.http.MediaType;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@org.springframework.test.context.TestPropertySource(properties={"SHARING_INVITE_BASE_URL=/invite/", "dio.signup.mail-from="})
class EmailInviteTests extends SharingTestSupport {
    @Autowired EmailInviteService emails;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    com.f106.DIO.notification.event.InvitationNotificationRepository notificationRepository;
    String address(Actor actor){return users.findById(actor.id()).orElseThrow().getEmail();}
    DiaryInvite pending(UUID diary,Actor to){return invites.pendingEmail(diary,to.id()).orElseThrow();}
    void send(UUID diary,Actor from,Actor to){emails.send(diary,from.id(),new EmailInviteRequest(address(to)));}
    long notifications(UUID diary,Actor recipient){return jdbc.queryForObject("select count(*) from notifications where diary_id=? and user_id=? and notification_type='DIARY_INVITE'",Long.class,diary,recipient.id());}
    @AfterEach void noInvitationSmtp(){verifyNoInteractions(smtp);}
    @Test void sendsOnlyToActiveRegisteredUsersAndSuppressesDuplicateUntilSevenDayExpiry() throws Exception {
        var owner=actor();var to=actor();var id=diary(owner);
        mvc.perform(post("/api/v1/diaries/"+id+"/invites/email").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\" "+address(to).toUpperCase(Locale.ROOT)+" \"}"))
            .andExpect(status().isAccepted());
        send(id,owner,to);
        assertThat(notifications(id,to)).isEqualTo(1);
        assertThat(invites.recentEmails(id,to.id(),java.time.Instant.now().minusSeconds(300))).hasSize(1);
        assertThat(pending(id,to).getExpiresAt()).isAfter(java.time.Instant.now().plusSeconds(6*24*60*60));
        assertThat(pending(id,to).getExpiresAt()).isBefore(java.time.Instant.now().plusSeconds(8*24*60*60));
        emails.send(id,owner.id(),new EmailInviteRequest("missing@example.com"));
        jdbc.update("update users set status='WITHDRAWN' where user_id=?",to.id());
        send(id,owner,to);assertThat(notifications(id,to)).isEqualTo(1);
        mvc.perform(get("/api/v1/diaries/"+id+"/invites").header("Authorization","Bearer "+owner.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("emailInvites.totalElements").value(1));
    }
    @Test void onlyRecipientCanViewAcceptAndConsumedEmailCannotBeReusedAfterLeaving() throws Exception {
        var owner=actor();var to=actor();var other=actor();var id=diary(owner);send(id,owner,to);
        String token=tokenSigner.token(pending(id,to));
        mvc.perform(get("/api/v1/invites/"+token)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/invites/"+token).header("Authorization","Bearer "+other.token())).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/invites/"+token).header("Authorization","Bearer "+to.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("inviteType").value("EMAIL")).andExpect(jsonPath("expiresAt").isEmpty());
        mvc.perform(post("/api/v1/invites/"+token+"/accept").header("Authorization","Bearer "+other.token())).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/invites/"+token+"/accept").header("Authorization","Bearer "+to.token())).andExpect(status().isOk());
        assertThat(links.accept(token,to.id()).alreadyMember()).isTrue();
        membership.remove(id,to.id(),to.id());
        assertThatThrownBy(()->links.accept(token,to.id())).isInstanceOfSatisfying(SharingException.class,e->assertThat(e.code).isEqualTo("INVITE_ALREADY_USED"));
    }
    @Test void editorCanCancelAndRecipientCanDeclineAndRateSurvivesBoth() throws Exception {
        var owner=actor();var editor=actor();var to=actor();var outsider=actor();var id=diary(owner);
        links.accept(links.create(id,owner.id()).token(),editor.id());
        send(id,owner,to);long first=pending(id,to).getInviteId();
        mvc.perform(post("/api/v1/me/invites/"+first+"/decline").header("Authorization","Bearer "+outsider.token())).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/me/invites/"+first+"/decline").header("Authorization","Bearer "+to.token())).andExpect(status().isNoContent());
        send(id,editor,to);long second=pending(id,to).getInviteId();
        mvc.perform(delete("/api/v1/diaries/"+id+"/invites/"+second).header("Authorization","Bearer "+editor.token())).andExpect(status().isNoContent());
        send(id,owner,to);long third=pending(id,to).getInviteId();emails.cancel(id,editor.id(),third);
        mvc.perform(post("/api/v1/diaries/"+id+"/invites/email").header("Authorization","Bearer "+editor.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+address(to)+"\"}"))
            .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
        assertThat(emails.received(to.id(),0,20).totalElements()).isEqualTo(3);
        assertThat(emails.received(outsider.id(),0,20).items()).isEmpty();
        assertThat(emails.sent(id,owner.id(),0,20).emailInvites().items()).extracting(i->i.status()).contains("DECLINED","CANCELLED");
    }
    @Test void linkRegenerationDoesNotCancelEmailAndLinkJoinConsumesPendingEmail() throws Exception {
        var owner=actor();var to=actor();var id=diary(owner);send(id,owner,to);long emailId=pending(id,to).getInviteId();
        String oldEmail=tokenSigner.token(pending(id,to));
        links.create(id,owner.id());var link=links.create(id,owner.id());
        assertThat(pending(id,to).getInviteId()).isEqualTo(emailId);
        links.accept(link.token(),to.id());assertThat(invites.findById(emailId).orElseThrow().status()).isEqualTo("ACCEPTED");
        membership.remove(id,owner.id(),to.id());
        assertThatThrownBy(()->links.accept(oldEmail,to.id())).isInstanceOf(SharingException.class);
    }
    @Test void invitationAndNotificationWorkWithoutSmtpOrAbsoluteBaseUrl() {
        var owner=actor();var to=actor();var id=diary(owner);send(id,owner,to);
        assertThat(notifications(id,to)).isEqualTo(1);
        assertThat(emails.received(to.id(),0,20).items().get(0).status()).isEqualTo("PENDING");
        assertThat(links.accept(tokenSigner.token(pending(id,to)),to.id()).alreadyMember()).isFalse();
        verifyNoInteractions(smtp);
    }
    @Test void notificationFailureRollsBackInvitationAndAllowsRetry() {
        var owner=actor();var to=actor();var id=diary(owner);
        doThrow(new IllegalStateException("notification unavailable"))
            .when(notificationRepository).createNotification(any(),any());
        assertThatThrownBy(()->send(id,owner,to)).isInstanceOf(org.springframework.dao.DataAccessException.class)
            .hasRootCauseInstanceOf(IllegalStateException.class);
        assertThat(invites.pendingEmail(id,to.id())).isEmpty();
        assertThat(notifications(id,to)).isZero();
        doCallRealMethod().when(notificationRepository).createNotification(any(),any());
        send(id,owner,to);
        assertThat(invites.pendingEmail(id,to.id())).isPresent();
        assertThat(notifications(id,to)).isEqualTo(1);
    }
    @Test void notificationFailuresConsumeAttemptBudgetEvenAfterRollback() throws Exception {
        var owner=actor();var to=actor();var other=actor();var id=diary(owner);
        doThrow(new IllegalStateException("notification unavailable"))
            .when(notificationRepository).createNotification(any(),any());
        for(int i=0;i<3;i++) {
            assertThatThrownBy(()->send(id,owner,to)).isInstanceOf(org.springframework.dao.DataAccessException.class);
            assertThat(invites.pendingEmail(id,to.id())).isEmpty();
            assertThat(notifications(id,to)).isZero();
        }
        assertThat(jdbc.queryForObject("select count(*) from invitation_notification_receipts where recipient_user_id=?",Long.class,to.id())).isZero();
        doCallRealMethod().when(notificationRepository).createNotification(any(),any());
        // Recovering the listener does not refund failed requests; the fourth attempt remains limited.
        mvc.perform(post("/api/v1/diaries/"+id+"/invites/email").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+address(to)+"\"}"))
            .andExpect(status().isTooManyRequests()).andExpect(jsonPath("code").value("EMAIL_INVITE_RATE_LIMITED"))
            .andExpect(header().exists("Retry-After"));
        assertThat(invites.pendingEmail(id,to.id())).isEmpty();
        send(id,owner,other);
        assertThat(notifications(id,other)).isEqualTo(1);
    }
    @Test void notificationFailurePropagatesInsteadOfReturningAccepted() {
        var owner=actor();var to=actor();var id=diary(owner);
        doThrow(new IllegalStateException("notification unavailable"))
            .when(notificationRepository).createNotification(any(),any());
        // MockMvc propagates an unhandled server exception; the servlet container renders it as 5xx.
        assertThatThrownBy(()->mvc.perform(post("/api/v1/diaries/"+id+"/invites/email")
            .header("Authorization","Bearer "+owner.token()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\""+address(to)+"\"}")))
            .hasRootCauseInstanceOf(IllegalStateException.class);
        assertThat(invites.pendingEmail(id,to.id())).isEmpty();
        assertThat(notifications(id,to)).isZero();
    }
    @Test void concurrentDuplicateSendsCreateOneInvitationAndOneNotification() throws Exception {
        var owner=actor();var to=actor();var id=diary(owner);var gate=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(5);
        try{
            var results=new ArrayList<Future<Boolean>>();
            for(int i=0;i<5;i++)results.add(pool.submit(()->{gate.await();try{send(id,owner,to);return true;}catch(SharingException error){assertThat(error.code).isEqualTo("EMAIL_INVITE_RATE_LIMITED");return false;}}));
            gate.countDown();int accepted=0;for(var result:results)if(result.get(30,TimeUnit.SECONDS))accepted++;
            assertThat(accepted).isEqualTo(3);
            assertThat(invites.recentEmails(id,to.id(),java.time.Instant.now().minusSeconds(300))).hasSize(1);
            assertThat(notifications(id,to)).isEqualTo(1);
        }finally{gate.countDown();pool.shutdownNow();}
    }
    @Test void responseLimitIsTheSameForRegisteredInactiveExistingMemberAndMissingEmails() throws Exception {
        var owner=actor();var recipient=actor();var inactive=actor();var id=diary(owner);
        jdbc.update("update users set status='WITHDRAWN' where user_id=?",inactive.id());
        for(String email:List.of(address(recipient),address(inactive),address(owner),UUID.randomUUID()+"@example.com")) {
            for(int i=0;i<3;i++)mvc.perform(post("/api/v1/diaries/"+id+"/invites/email").header("Authorization","Bearer "+owner.token())
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+email+"\"}"))
                .andExpect(status().isAccepted()).andExpect(jsonPath("message").value("가입된 이메일이라면 초대가 전달됩니다."));
            mvc.perform(post("/api/v1/diaries/"+id+"/invites/email").header("Authorization","Bearer "+owner.token())
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+email+"\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("code").value("EMAIL_INVITE_RATE_LIMITED"));
        }
    }
    @Test void durableSendQuotaDoesNotExposeTheRecipientAfterAnInstanceRestart() throws Exception {
        var owner=actor();var recipient=actor();var id=diary(owner);
        // Reproduce invitations created by a previous instance without consuming this instance's request budget.
        for(int i=0;i<3;i++) {
            var row=invites.saveAndFlush(DiaryInvite.email(id,owner.id(),recipient.id(),java.time.Instant.now()));
            row.initializeHash(tokenSigner.hash(tokenSigner.token(row)));row.cancel(java.time.Instant.now());invites.saveAndFlush(row);
        }
        mvc.perform(post("/api/v1/diaries/"+id+"/invites/email").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+address(recipient)+"\"}"))
            .andExpect(status().isAccepted());
        assertThat(invites.recentEmails(id,recipient.id(),java.time.Instant.now().minusSeconds(300))).hasSize(3);
        assertThat(notifications(id,recipient)).isZero();
    }
    @Test void trashedDiaryInvitationsAreExcludedFromReceivedPagesAndReturnAfterRestore() throws Exception {
        var owner=actor();var recipient=actor();var hidden=diary(owner);var visible=diary(owner);
        send(hidden,owner,recipient);send(visible,owner,recipient);
        assertThat(emails.received(recipient.id(),0,1).totalElements()).isEqualTo(2);
        var diary=diaries.findById(hidden).orElseThrow();diary.softDelete();diaries.saveAndFlush(diary);
        var page=emails.received(recipient.id(),0,1);
        assertThat(page.totalElements()).isEqualTo(1);assertThat(page.hasNext()).isFalse();
        assertThat(page.items()).extracting(i->i.diaryId()).containsExactly(visible);
        mvc.perform(get("/api/v1/me/invites").param("size","1").header("Authorization","Bearer "+recipient.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("totalElements").value(1))
            .andExpect(jsonPath("items[0].diaryId").value(visible.toString()));
        assertThat(invites.pendingEmail(hidden,recipient.id())).isPresent();
        jdbc.update("update diaries set deleted_at=null where diary_id=?",hidden);
        assertThat(emails.received(recipient.id(),0,20).totalElements()).isEqualTo(2);
    }
    @Test void requesterFloodingDifferentEmailsDoesNotBlockAnotherEditor() throws Exception {
        var owner=actor();var editor=actor();var id=diary(owner);links.accept(links.create(id,owner.id()).token(),editor.id());
        for(int i=0;i<20;i++)sendToMissing(id,owner,UUID.randomUUID()+"@example.com").andExpect(status().isAccepted());
        sendToMissing(id,owner,UUID.randomUUID()+"@example.com").andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("code").value("EMAIL_INVITE_ACTOR_RATE_LIMITED")).andExpect(header().exists("Retry-After"));
        sendToMissing(id,editor,UUID.randomUUID()+"@example.com").andExpect(status().isAccepted());
    }
    private org.springframework.test.web.servlet.ResultActions sendToMissing(UUID id,Actor actor,String email) throws Exception {
        return mvc.perform(post("/api/v1/diaries/"+id+"/invites/email").header("Authorization","Bearer "+actor.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\""+email+"\"}"));
    }
    @Test void capacityIsCheckedAtAcceptanceAndPendingInvitationSurvivesFullDiary() throws Exception {
        var owner=actor();var to=actor();var id=diary(owner);var link=links.create(id,owner.id());Actor leaver=null;
        for(int i=0;i<3;i++){leaver=actor();links.accept(link.token(),leaver.id());}
        send(id,owner,to);String token=tokenSigner.token(pending(id,to));
        assertThatThrownBy(()->links.accept(token,to.id())).isInstanceOfSatisfying(SharingException.class,e->assertThat(e.code).isEqualTo("DIARY_MEMBER_LIMIT_REACHED"));
        assertThat(pending(id,to)).isNotNull();membership.remove(id,leaver.id(),leaver.id());
        assertThat(links.accept(token,to.id()).currentMembers()).isEqualTo(4);
    }
    @Test void swaggerListsNewRoutesAndCurrentLinkIdCanBeCancelled() throws Exception {
        var owner=actor();var id=diary(owner);var link=links.create(id,owner.id());
        mvc.perform(get("/api/v1/diaries/"+id+"/invites").header("Authorization","Bearer "+owner.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("token").value(link.token())).andExpect(jsonPath("linkInviteId").exists());
        String inviteId=emails.sent(id,owner.id(),0,20).linkInviteId();
        mvc.perform(delete("/api/v1/diaries/"+id+"/invites/"+inviteId).header("Authorization","Bearer "+owner.token())).andExpect(status().isNoContent());
        assertThatThrownBy(()->links.preview(link.token())).isInstanceOf(SharingException.class);
        mvc.perform(options("/api/v1/diaries/"+id+"/invites/email").header("Origin","http://localhost:8081")
            .header("Access-Control-Request-Method","POST")).andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:8081"));
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/invites/email'].post.responses['202']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/invites/{inviteId}'].delete.responses['204']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/me/invites'].get.security[0].bearerAuth").exists())
            .andExpect(jsonPath("$.paths['/api/v1/me/invites/{inviteId}/decline'].post.responses['204']").exists());
    }
    @Test void newPathsRequireAuthenticationAndOutsidersCannotSendOrCancel() throws Exception {
        UUID id=UUID.randomUUID();
        mvc.perform(get("/api/v1/me/invites")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/me/invites/1/decline")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/v1/diaries/"+id+"/invites/1")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/diaries/"+id+"/invites/email")).andExpect(status().isUnauthorized());
        var owner=actor();var outsider=actor();var to=actor();id=diary(owner);send(id,owner,to);
        long inviteId=pending(id,to).getInviteId();
        final UUID owned=id;
        assertThatThrownBy(()->send(owned,outsider,to)).isInstanceOf(SharingException.class);
        assertThatThrownBy(()->emails.cancel(owned,outsider.id(),inviteId)).isInstanceOf(SharingException.class);
        mvc.perform(get("/api/v1/me/invites?size=101").header("Authorization","Bearer "+to.token())).andExpect(status().isBadRequest());
    }
}
