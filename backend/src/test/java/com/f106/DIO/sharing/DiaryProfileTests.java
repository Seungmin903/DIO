package com.f106.DIO.sharing;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.infrastructure.storage.SharingPhotoStorage;
import com.f106.DIO.sharing.repository.SharingProfileMediaRepository;
import com.f106.DIO.user.domain.ProfilePhoto;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import java.util.UUID;
import java.time.Instant;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class DiaryProfileTests extends SharingTestSupport {
    @Autowired ProfilePhotoRepository accountPhotos;
    @Autowired SharingProfileMediaRepository profileMedia;
    @MockitoSpyBean SharingPhotoStorage photoStorage;
    byte[] png() throws Exception {var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(6,4,BufferedImage.TYPE_INT_RGB),"png",out);return out.toByteArray();}
    DiaryProfileResponse upload(UUID diary,Actor actor) throws Exception {return profiles.update(diary,actor.id(),new DiaryProfileUpdateRequest(),new MockMultipartFile("photo","photo.png","image/png",png()));}
    @Test void duplicateNicknamesAreAllowedAndNullRestoresAccountNickname() throws Exception {
        var owner=actor();var editor=actor();var id=diary(owner);links.accept(links.create(id,owner.id()).token(),editor.id());
        for(var actor:new Actor[]{owner,editor})mvc.perform(patch("/api/v1/diaries/"+id+"/membership").header("Authorization","Bearer "+actor.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"여행친구\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("nickname").value("여행친구"));
        assertThat(membership.list(id,owner.id()).members()).extracting(m->m.nickname()).containsOnly("여행친구");
        mvc.perform(patch("/api/v1/diaries/"+id+"/membership").header("Authorization","Bearer "+editor.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":null}"))
            .andExpect(status().isOk()).andExpect(jsonPath("nickname").value(users.findById(editor.id()).orElseThrow().getNickname()));
    }
    @Test void customPhotoIsIndependentAndResetAutomaticallyUsesCurrentAccountPhoto() throws Exception {
        var owner=actor();var first=diary(owner);var second=diary(owner);
        var account=accountPhotos.saveAndFlush(new ProfilePhoto(owner.id(),png(),Instant.now()));
        String cursor=membership.list(first,owner.id()).members().get(0).memberColor();
        var result=upload(first,owner);
        assertThat(result.memberProfilePhotoId()).isNotNull();assertThat(result.usingAccountPhoto()).isFalse();
        assertThat(result.memberColor()).isEqualTo(cursor);assertThat(accountPhotos.findByUserId(owner.id()).orElseThrow().getPhotoId()).isEqualTo(account.getPhotoId());
        assertThat(membership.list(second,owner.id()).members().get(0).profilePhotoUrl()).isEqualTo(account.url());
        mvc.perform(patch("/api/v1/diaries/"+first+"/membership").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"favorite\":true}"))
            .andExpect(status().isOk()).andExpect(jsonPath("memberProfilePhotoId").value(result.memberProfilePhotoId().toString()));
        mvc.perform(patch("/api/v1/diaries/"+first+"/membership").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"memberProfilePhotoId\":null}"))
            .andExpect(status().isOk()).andExpect(jsonPath("profilePhotoUrl").value(account.url())).andExpect(jsonPath("usingAccountPhoto").value(true));
        accountPhotos.deleteById(account.getPhotoId());var replacement=accountPhotos.saveAndFlush(new ProfilePhoto(owner.id(),png(),Instant.now()));
        assertThat(membership.list(first,owner.id()).members().get(0).profilePhotoUrl()).isEqualTo(replacement.url());
        assertThat(profileMedia.findById(result.memberProfilePhotoId())).isPresent();
    }
    @Test void multipartUploadAndPhotoReadRequireCurrentMembershipAndDoNotHoldTransactionsForIo() throws Exception {
        var owner=actor();var viewer=actor();var outsider=actor();var id=diary(owner);
        links.accept(links.create(id,owner.id()).token(),viewer.id());
        doAnswer(call->{assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();return call.callRealMethod();}).when(photoStorage).upload(any(),any());
        doAnswer(call->{assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();return call.callRealMethod();}).when(photoStorage).read(any());
        var json=new MockMultipartFile("profile","","application/json","{\"nickname\":\"새프로필\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/v1/diaries/"+id+"/membership").file(json).file(new MockMultipartFile("photo","photo.png","image/png",png()))
            .with(request->{request.setMethod("PATCH");return request;}).header("Authorization","Bearer "+owner.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("nickname").value("새프로필"));
        String url=membership.list(id,owner.id()).members().stream().filter(m->m.userId().equals(Long.toString(owner.id()))).findFirst().orElseThrow().profilePhotoUrl();
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        mvc.perform(get(url).header("Authorization","Bearer "+outsider.token())).andExpect(status().isForbidden());
        mvc.perform(get(url).header("Authorization","Bearer "+viewer.token())).andExpect(status().isOk()).andExpect(content().contentType("image/png"));
        membership.remove(id,owner.id(),viewer.id());
        mvc.perform(get(url).header("Authorization","Bearer "+viewer.token())).andExpect(status().isForbidden());
    }
    @Test void photosOwnedByAnotherUserCannotBeAssignedAndFailedUploadDoesNotChangeProfile() throws Exception {
        var owner=actor();var other=actor();var id=diary(owner);var otherId=diary(other);var photo=upload(otherId,other);
        mvc.perform(patch("/api/v1/diaries/"+id+"/membership").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"memberProfilePhotoId\":\""+photo.memberProfilePhotoId()+"\"}"))
            .andExpect(status().isBadRequest());
        assertThatThrownBy(()->profiles.update(id,owner.id(),new DiaryProfileUpdateRequest(),new MockMultipartFile("photo","broken.png","image/png",new byte[]{1,2,3})))
            .isInstanceOf(SharingException.class);
        assertThat(members.findById(new DiaryMemberId(id,owner.id())).orElseThrow().getMemberProfilePhotoId()).isNull();
        assertThat(accountPhotos.findByUserId(owner.id())).isEmpty();
    }
    @Test void oneOwnedPhotoCanBeReusedWithoutUpdatingOtherDiaryWhenReplaced() throws Exception {
        var owner=actor();var first=diary(owner);var second=diary(owner);var photo=upload(first,owner);
        var request=new DiaryProfileUpdateRequest();request.setMemberProfilePhotoId(photo.memberProfilePhotoId());profiles.update(second,owner.id(),request,null);
        var replacement=upload(first,owner);
        assertThat(replacement.memberProfilePhotoId()).isNotEqualTo(photo.memberProfilePhotoId());
        assertThat(members.findById(new DiaryMemberId(second,owner.id())).orElseThrow().getMemberProfilePhotoId()).isEqualTo(photo.memberProfilePhotoId());
        String url=membership.list(second,owner.id()).members().get(0).profilePhotoUrl();
        mvc.perform(get(url).header("Authorization","Bearer "+owner.token())).andExpect(status().isOk());
    }
    @Test void losingMembershipDuringUploadRollsBackPhotoAndLeavesNoStorageObject() throws Exception {
        var owner=actor();var editor=actor();var id=diary(owner);links.accept(links.create(id,owner.id()).token(),editor.id());
        var location=new java.util.concurrent.atomic.AtomicReference<com.f106.DIO.user.infrastructure.storage.ProfilePhotoStorage.Location>();
        doAnswer(call->{
            var pending=(com.f106.DIO.user.infrastructure.storage.ProfilePhotoFiles.PendingPhoto)call.callRealMethod();location.set(pending.getLocation());
            membership.remove(id,owner.id(),editor.id());return pending;
        }).when(photoStorage).upload(any(),any());
        assertThatThrownBy(()->upload(id,editor)).isInstanceOf(SharingException.class);
        assertThat(java.nio.file.Files.exists(java.nio.file.Path.of("build/test-member-photos").resolve(location.get().key()))).isFalse();
        assertThat(members.findById(new DiaryMemberId(id,editor.id())).orElseThrow().getMemberProfilePhotoId()).isNull();
    }
    @Test void invalidNicknamesAreRejectedAndLegacyMutationRoutesAreNotExposed() throws Exception {
        var owner=actor();var id=diary(owner);
        mvc.perform(patch("/api/v1/diaries/"+id+"/membership").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\" \"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/membership'].patch.requestBody.content['application/json']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/diaries/{diaryId}/membership'].patch.requestBody.content['multipart/form-data'].encoding.profile.contentType").value("application/json"));
        mvc.perform(patch("/api/v1/diaries/"+id+"/profile").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"favorite\":true}" )).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/diaries/"+id+"/ownership-transfer-and-leave").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"newOwnerUserId\":1}" )).andExpect(status().isNotFound());
    }
    @Test void membershipRoutePreservesAuthenticationAuthorizationAndCors() throws Exception {
        var owner=actor();var outsider=actor();var id=diary(owner);var route="/api/v1/diaries/"+id+"/membership";
        mvc.perform(patch(route).contentType(MediaType.APPLICATION_JSON).content("{\"favorite\":true}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(patch(route).header("Authorization","Bearer "+outsider.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"favorite\":true}"))
            .andExpect(status().isForbidden());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options(route)
            .header("Origin","http://localhost:8081").header("Access-Control-Request-Method","PATCH")
            .header("Access-Control-Request-Headers","authorization,content-type"))
            .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:8081"));
    }
}
