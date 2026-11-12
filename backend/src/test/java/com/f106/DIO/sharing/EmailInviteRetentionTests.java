package com.f106.DIO.sharing;
import com.f106.DIO.sharing.domain.DiaryInvite;
import com.f106.DIO.sharing.service.InvitationRetentionCleanup;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class EmailInviteRetentionTests extends SharingTestSupport {
    @Autowired InvitationRetentionCleanup cleanup;
    /** V28 이전처럼 9999년 만료값을 가진 대기 이메일 초대를 만든다. 토큰은 바뀐 생성 시각으로 다시 서명한다. */
    String legacyInvite(UUID diary,Actor from,Actor to,Instant createdAt){
        long id=invites.saveAndFlush(DiaryInvite.email(diary,from.id(),to.id(),Instant.now().truncatedTo(ChronoUnit.MICROS))).getInviteId();
        jdbc.update("update diary_invites set created_at=?,expires_at=? where invite_id=?",Timestamp.from(createdAt),Timestamp.from(Instant.parse("9999-12-31T23:59:59Z")),id);
        var invite=invites.findById(id).orElseThrow();String token=tokenSigner.token(invite);invite.initializeHash(tokenSigner.hash(token));invites.saveAndFlush(invite);
        return token;
    }
    @Test void legacyEmailInviteExpiresSevenDaysAfterCreationDespiteFarFutureExpiry() throws Exception {
        var owner=actor();var to=actor();var id=diary(owner);
        String token=legacyInvite(id,owner,to,Instant.now().minus(8,ChronoUnit.DAYS));
        assertThat(invites.pendingEmail(id,to.id())).isEmpty();
        mvc.perform(post("/api/v1/invites/"+token+"/accept").header("Authorization","Bearer "+to.token()))
            .andExpect(status().isGone()).andExpect(jsonPath("code").value("INVITE_EXPIRED"));
        assertThat(jdbc.queryForObject("select count(*) from diary_members where diary_id=? and user_id=?",Long.class,id,to.id())).isZero();
        // 보존 기한(V28 백필: 생성 + 7일)이 지나 정리되면 410이 아니라 404이고, 보낸 목록에서도 사라진다.
        purge(token);
        mvc.perform(post("/api/v1/invites/"+token+"/accept").header("Authorization","Bearer "+to.token()))
            .andExpect(status().isNotFound()).andExpect(jsonPath("code").value("INVITE_NOT_FOUND"));
        mvc.perform(get("/api/v1/diaries/"+id+"/invites").header("Authorization","Bearer "+owner.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("emailInvites.totalElements").value(0));
    }
    /** 이 초대의 보존 기한을 지난 것으로 바꾸고 정리 작업을 돌린다. */
    void purge(String token){
        long inviteId=Long.parseLong(token.split("[.]")[0]);
        jdbc.update("update diary_invites set retention_until=? where invite_id=?",Timestamp.from(Instant.now().minusSeconds(1)),inviteId);
        cleanup.clean(Instant.now());
        assertThat(invites.findById(inviteId)).isEmpty();
    }
    @Test void legacyEmailInviteWithinSevenDaysKeepsItsTokenAndCanBeAccepted() throws Exception {
        var owner=actor();var to=actor();var id=diary(owner);
        String token=legacyInvite(id,owner,to,Instant.now().minus(6,ChronoUnit.DAYS));
        assertThat(invites.pendingEmail(id,to.id())).isPresent();
        mvc.perform(get("/api/v1/invites/"+token).header("Authorization","Bearer "+to.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("status").value("PENDING")).andExpect(jsonPath("expiresAt").isNotEmpty());
        mvc.perform(post("/api/v1/invites/"+token+"/accept").header("Authorization","Bearer "+to.token())).andExpect(status().isOk());
    }
    @Test void acceptedEmailInviteReportsMembershipUntilRetentionCleanup() throws Exception {
        var owner=actor();var to=actor();var id=diary(owner);
        String token=legacyInvite(id,owner,to,Instant.now().minus(1,ChronoUnit.DAYS));
        mvc.perform(post("/api/v1/invites/"+token+"/accept").header("Authorization","Bearer "+to.token())).andExpect(status().isOk());
        // 수락한 뒤 8일이 지나도 만료가 아니라 이미 참여한 멤버로 응답한다.
        long inviteId=Long.parseLong(token.split("[.]")[0]);
        jdbc.update("update diary_invites set created_at=? where invite_id=?",Timestamp.from(Instant.now().minus(8,ChronoUnit.DAYS)),inviteId);
        var invite=invites.findById(inviteId).orElseThrow();String aged=tokenSigner.token(invite);invite.initializeHash(tokenSigner.hash(aged));invites.saveAndFlush(invite);
        assertThat(invite.expired(Instant.now())).isFalse();
        mvc.perform(post("/api/v1/invites/"+aged+"/accept").header("Authorization","Bearer "+to.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("alreadyMember").value(true));
        // 수락 후 7일 보존이 끝나 정리되면 멤버여도 404다. 참여 자체는 그대로 남는다.
        purge(aged);
        mvc.perform(post("/api/v1/invites/"+aged+"/accept").header("Authorization","Bearer "+to.token()))
            .andExpect(status().isNotFound()).andExpect(jsonPath("code").value("INVITE_NOT_FOUND"));
        mvc.perform(get("/api/v1/me/invites").header("Authorization","Bearer "+to.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("totalElements").value(0));
        assertThat(jdbc.queryForObject("select count(*) from diary_members where diary_id=? and user_id=? and left_at is null",Long.class,id,to.id())).isEqualTo(1);
    }
    @Test void cleanupDeletesOnlyEmailInvitesPastRetentionInBatches() {
        var owner=actor();var to=actor();var id=diary(owner);Instant now=Instant.now().truncatedTo(ChronoUnit.MICROS);
        var expired=new ArrayList<Long>();
        for(int n=0;n<501;n++)
            expired.add(invites.save(DiaryInvite.email(id,owner.id(),to.id(),now)).getInviteId());
        long boundary=invites.save(DiaryInvite.email(id,owner.id(),to.id(),now)).getInviteId();
        long retained=invites.save(DiaryInvite.email(id,owner.id(),to.id(),now)).getInviteId();
        long link=invites.saveAndFlush(new DiaryInvite(id,owner.id(),now)).getInviteId();
        jdbc.update("update diary_invites set retention_until=? where diary_id=?",Timestamp.from(now.minusSeconds(1)),id);
        jdbc.update("update diary_invites set retention_until=? where invite_id=?",Timestamp.from(now),boundary);
        jdbc.update("update diary_invites set retention_until=? where invite_id=?",Timestamp.from(now.plusSeconds(1)),retained);
        // 501건은 500건 배치 두 번에 걸쳐 지워지고, 보존 기한이 정확히 지금인 행도 대상이다.
        String receipt="insert into invitation_notification_receipts(event_id,recipient_user_id,invite_id,event_occurred_at,outcome,processed_at) values(?,?,?,current_timestamp,'CREATED',current_timestamp)";
        jdbc.update(receipt,UUID.randomUUID(),to.id(),expired.get(0));
        jdbc.update(receipt,UUID.randomUUID(),to.id(),retained);
        // 같은 H2 DB를 쓰는 다른 테스트의 만료 행이 함께 지워질 수 있어 하한만 확인한다.
        assertThat(cleanup.clean(now)).isGreaterThanOrEqualTo(502);
        assertThat(invites.findAllById(expired)).isEmpty();
        assertThat(invites.findById(boundary)).isEmpty();
        assertThat(invites.findById(retained)).isPresent();
        assertThat(invites.findById(link)).as("LINK 초대는 이메일 보존 정리 대상이 아니다").isPresent();
        assertThat(jdbc.queryForList("select invite_id from invitation_notification_receipts where invite_id in (?,?)",Long.class,expired.get(0),retained)).containsExactly(retained);
    }
}
