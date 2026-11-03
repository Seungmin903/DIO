package com.f106.DIO.sharing;
import com.f106.DIO.user.domain.*;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.service.UserWithdrawalPhotoCleanup;
import com.f106.DIO.diary.domain.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.boot.test.context.SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:user-withdrawal-tests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.photos.storage=local", "dio.signup.photos.local-directory=build/test-withdrawal-photos",
    "SHARING_INVITE_BASE_URL=https://dio.test/invite/", "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    "spring.datasource.hikari.maximum-pool-size=12"})
class UserWithdrawalTests extends SharingTestSupport {
    @Autowired ProfilePhotoRepository photos;
    @Autowired UserWithdrawalPhotoCleanup photoCleanup;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    com.f106.DIO.user.infrastructure.storage.ProfilePhotoFiles photoFiles;
    @BeforeEach void referenceFixtures(){
        // 기존 SQL 전용 테이블을 H2 테스트에서도 같은 이름으로 제공한다. 운영 마이그레이션은 추가하지 않는다.
        jdbc.execute("alter table media_files add column if not exists source_media_file_id uuid");
        jdbc.execute("create table if not exists ai_jobs(source_media_file_id uuid,result_media_file_id uuid)");
        jdbc.execute("create table if not exists notifications(notification_id bigint,user_id bigint,diary_id uuid,page_id uuid)");
        jdbc.execute("create table if not exists element_strokes(element_id uuid)");
        jdbc.execute("create table if not exists diary_handwriting_fonts(diary_id uuid,font_media_file_id uuid,granted_by_user_id bigint)");
        jdbc.execute("create table if not exists diary_media_library(diary_id uuid,media_file_id uuid)");
    }
    @Test void failedPhotoDeletionKeepsMetadataForRetry()throws Exception{
        var actor=actor();var id=UUID.randomUUID();
        photos.saveAndFlush(new ProfilePhoto(id,actor.id(),"LOCAL","profile-photos/"+id+".png",null,Instant.now()));
        mvc.perform(delete("/api/v1/me").header("Authorization","Bearer "+actor.token())).andExpect(status().isNoContent());
        org.mockito.Mockito.doThrow(new IllegalStateException("storage unavailable")).when(photoFiles).delete(org.mockito.ArgumentMatchers.any(ProfilePhoto.class));
        photoCleanup.clean();assertThat(photos.findById(id)).isPresent();
        org.mockito.Mockito.doNothing().when(photoFiles).delete(org.mockito.ArgumentMatchers.any(ProfilePhoto.class));
        photoCleanup.clean();assertThat(photos.findById(id)).isEmpty();
    }
    @Test void failingFirstHundredPhotosDoNotStarveLaterPhotos(){
        var people=new ArrayList<User>();
        for(int i=0;i<101;i++)people.add(new User(null,"정리테스트",Instant.now()));
        users.saveAllAndFlush(people);people.forEach(u->u.withdraw(Instant.now()));users.saveAllAndFlush(people);
        var pending=new ArrayList<ProfilePhoto>();var failed=new HashSet<UUID>();
        for(int i=0;i<101;i++){
            var id=UUID.fromString(String.format("10000000-0000-0000-0000-%012x",i+1));
            pending.add(new ProfilePhoto(id,people.get(i).getUserId(),"LOCAL","profile-photos/"+id+".png",null,Instant.now()));
            if(i<100)failed.add(id);
        }
        photos.saveAllAndFlush(pending);
        org.mockito.Mockito.doAnswer(call->{if(failed.contains(((ProfilePhoto)call.getArgument(0)).getPhotoId()))throw new IllegalStateException("permanent failure");return null;})
            .when(photoFiles).delete(org.mockito.ArgumentMatchers.any(ProfilePhoto.class));
        try{
            photoCleanup.clean();photoCleanup.clean();
            assertThat(photos.findById(pending.get(100).getPhotoId())).isEmpty();
            assertThat(photos.findById(pending.get(0).getPhotoId())).isPresent();
        }finally{
            org.mockito.Mockito.doNothing().when(photoFiles).delete(org.mockito.ArgumentMatchers.any(ProfilePhoto.class));
            photoCleanup.clean();photoCleanup.clean();
        }
    }
    @Test void authenticationIsRequired()throws Exception{mvc.perform(delete("/api/v1/me")).andExpect(status().isUnauthorized());}
    @Test void withdrawalAnonymizesAccountAndRevokesSessionsButKeepsOtherAccounts()throws Exception{
        var actor=actor();var other=actor();String email=users.findById(actor.id()).orElseThrow().getEmail();
        var photo=photos.saveAndFlush(new ProfilePhoto(actor.id(),new byte[]{1,2},Instant.now()));
        mvc.perform(delete("/api/v1/me").header("Authorization","Bearer "+actor.token())).andExpect(status().isNoContent()).andExpect(content().string(""));
        var deleted=users.findById(actor.id()).orElseThrow();assertThat(deleted.isActive()).isFalse();assertThat(deleted.getEmail()).isNull();assertThat(deleted.getNickname()).isEqualTo("탈퇴한 사용자");
        assertThat(accounts.findByUserIdAndProvider(actor.id(),"EMAIL")).isEmpty();
        assertThat(users.findById(other.id()).orElseThrow().isActive()).isTrue();
        mvc.perform(delete("/api/v1/me").header("Authorization","Bearer "+actor.token())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/auth/profile-photos/"+photo.getPhotoId())).andExpect(status().isNotFound());
        photoCleanup.clean();assertThat(photos.findById(photo.getPhotoId())).isEmpty();
        assertThat(users.saveAndFlush(new User(email,"재가입",Instant.now())).getUserId()).isNotEqualTo(actor.id());
    }
    @Test void ownerMustTransferBeforeWithdrawalAndConflictRollsBackEverything()throws Exception{
        var actor=actor();var friend=actor();var shared=diary(actor);links.accept(links.create(shared,actor.id()).token(),friend.id());
        var personal=diary(actor);
        mvc.perform(delete("/api/v1/me").header("Authorization","Bearer "+actor.token()))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OWNER_TRANSFER_REQUIRED"));
        assertThat(users.findById(actor.id()).orElseThrow().isActive()).isTrue();assertThat(diaries.existsById(personal)).isTrue();
        ownership.transfer(shared,actor.id(),friend.id());
        mvc.perform(delete("/api/v1/me").header("Authorization","Bearer "+actor.token())).andExpect(status().isNoContent());
        assertThat(diaries.existsById(personal)).isFalse();assertThat(diaries.findById(shared).orElseThrow().getOwnerUserId()).isEqualTo(friend.id());
        assertThat(membership.list(shared,friend.id()).currentMembers()).isEqualTo(1);
    }
    @Test void withdrawalRevokesUsedLinksButKeepsJoinedMembersAndOtherInvitersLinks()throws Exception{
        var owner=actor();var editor=actor();var joined=actor();var shared=diary(owner);
        links.accept(links.create(shared,owner.id()).token(),editor.id());
        var used=links.create(shared,editor.id());links.accept(used.token(),joined.id());
        var otherDiary=diary(owner);var otherLink=links.create(otherDiary,owner.id());
        var accepted= com.f106.DIO.sharing.domain.DiaryInvite.email(shared,editor.id(),joined.id(),Instant.now());
        accepted.acceptedEmail(Instant.now());var acceptedId=invites.saveAndFlush(accepted).getInviteId();
        mvc.perform(delete("/api/v1/me").header("Authorization","Bearer "+editor.token())).andExpect(status().isNoContent());
        var revoked=invites.findById(Long.parseLong(used.token().split("\\.")[0])).orElseThrow();
        assertThat(revoked.getUseCount()).isEqualTo(1);assertThat(revoked.getRevokedAt()).isNotNull();
        assertThatThrownBy(()->links.preview(used.token())).isInstanceOf(com.f106.DIO.sharing.exception.SharingException.class)
            .hasMessageContaining("새 초대 링크");
        assertThatThrownBy(()->links.accept(used.token(),owner.id())).isInstanceOf(com.f106.DIO.sharing.exception.SharingException.class)
            .hasMessageContaining("새 초대 링크");
        assertThat(membership.list(shared,owner.id()).currentMembers()).isEqualTo(2);
        assertThat(membership.list(shared,joined.id()).currentMembers()).isEqualTo(2);
        assertThat(links.preview(otherLink.token()).diaryId()).isEqualTo(otherDiary);
        var history=invites.findById(acceptedId).orElseThrow();
        assertThat(history.getInviteType()).isEqualTo("EMAIL_ACCEPTED");assertThat(history.getRevokedAt()).isNull();
    }
    @Test void otherOwnersDiaryAndItsCanvasRemainAfterEditorWithdraws()throws Exception{
        var owner=actor();var editor=actor();var shared=diary(owner);links.accept(links.create(shared,owner.id()).token(),editor.id());
        var page=UUID.randomUUID();
        jdbc.update("insert into pages(page_id,diary_id,sort_key,canvas_width,canvas_height,grid_visible,version,created_at,updated_at) values (?,?,1,100,100,false,0,current_timestamp,current_timestamp)",page,shared);
        var element=UUID.randomUUID();
        jdbc.update("insert into canvas_elements(element_id,page_id,element_type,sort_key,x,y,width,height,rotation,opacity,is_locked,is_hidden,created_by,version,created_at,updated_at) values (?,?,'TEXT',1,0,0,10,10,0,1,false,false,?,0,current_timestamp,current_timestamp)",element,page,editor.id());
        mvc.perform(delete("/api/v1/me").header("Authorization","Bearer "+editor.token())).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from canvas_elements where element_id=?",Long.class,element)).isEqualTo(1);
        assertThat(membership.list(shared,owner.id()).currentMembers()).isEqualTo(1);
        assertThat(diaries.existsById(shared)).isTrue();
    }
}
