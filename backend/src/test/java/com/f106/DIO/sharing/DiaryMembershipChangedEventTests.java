package com.f106.DIO.sharing;

import com.f106.DIO.diary.domain.*;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.domain.*;
import com.f106.DIO.sharing.repository.*;
import com.f106.DIO.sharing.service.*;
import com.f106.DIO.sharing.support.InviteTokens;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;
import static org.mockito.Mockito.*;

class DiaryMembershipChangedEventTests {
    @Test void profileIdentityEventIsLimitedToNicknameOrPhotoChanges(){
        var nickname=new com.f106.DIO.sharing.dto.DiaryProfileUpdateRequest();nickname.setNickname("소연");
        var photo=new com.f106.DIO.sharing.dto.DiaryProfileUpdateRequest();photo.setMemberProfilePhotoId(UUID.randomUUID());
        org.assertj.core.api.Assertions.assertThat(DiaryProfileService.memberIdentityChanged(nickname,false)).isTrue();
        org.assertj.core.api.Assertions.assertThat(DiaryProfileService.memberIdentityChanged(photo,true)).isTrue();
        org.assertj.core.api.Assertions.assertThat(DiaryProfileService.memberIdentityChanged(new com.f106.DIO.sharing.dto.DiaryProfileUpdateRequest(true,null),false)).isFalse();
    }
    @Test void withdrawalPublishesOnlyForJoinedDiariesNotDeletedOwnedDiaries(){
        long actor=7L;UUID owned=UUID.randomUUID(),joined=UUID.randomUUID();var jdbc=mock(JdbcTemplate.class);var deletion=mock(DiaryPermanentDeletionRepository.class);var events=mock(ApplicationEventPublisher.class);
        when(jdbc.queryForList(startsWith("select diary_id"),eq(UUID.class),eq(actor),eq(actor))).thenReturn(List.of(owned,joined));
        when(jdbc.queryForList(startsWith("select owner_user_id"),eq(owned))).thenReturn(List.of(Map.of("owner_user_id",actor)));
        when(jdbc.queryForList(startsWith("select owner_user_id"),eq(joined))).thenReturn(List.of(Map.of("owner_user_id",9L)));
        when(jdbc.queryForObject(startsWith("select count"),eq(Long.class),eq(owned),eq(actor))).thenReturn(0L);
        new UserWithdrawalDiaryAdapter(jdbc,deletion,events).remove(actor,Instant.now());
        verify(deletion).delete(owned);verify(events).publishEvent(new DiaryMembershipChanged(joined));verify(events,never()).publishEvent(new DiaryMembershipChanged(owned));
    }
    @Test void joiningLeavingAndOwnershipTransferPublishMembershipChanged() {
        UUID id=UUID.randomUUID();var events=mock(ApplicationEventPublisher.class);
        var access=mock(SharingAccessService.class);var members=mock(DiaryMemberRepository.class);var invites=mock(DiaryInviteRepository.class);
        var diary=new Diary(id,"test","#FFFFFF","PLAIN","PRIVATE");diary.transferOwnership(1L);
        var leaving=new DiaryMember(id,2L,"EDITOR");
        when(access.lock(id)).thenReturn(diary);when(access.member(diary,2L)).thenReturn(leaving);when(members.findById(new DiaryMemberId(id,2L))).thenReturn(Optional.of(leaving));
        new DiaryMembershipService(access,members,invites,mock(MemberProfileResolver.class),mock(DiaryPermanentDeletionRepository.class),mock(com.f106.DIO.moderation.service.BlockService.class),events).remove(id,2L,2L);
        verify(events).publishEvent(new DiaryMembershipChanged(id));

        reset(events);var owner=new DiaryMember(id,1L,"OWNER");var successor=new DiaryMember(id,3L,"EDITOR");
        when(access.member(diary,1L)).thenReturn(owner);when(access.member(diary,3L)).thenReturn(successor);
        new DiaryOwnershipService(access,events).transfer(id,1L,3L);
        verify(events).publishEvent(new DiaryMembershipChanged(id));
    }
    @Test void acceptingInvitePublishesEventButRejectedTransferDoesNot() {
        UUID id=UUID.randomUUID();var events=mock(ApplicationEventPublisher.class);var access=mock(SharingAccessService.class);var members=mock(DiaryMemberRepository.class);var invites=mock(DiaryInviteRepository.class);
        var tokens=new InviteTokens(Base64.getEncoder().encodeToString(new byte[32]),"https://dio.test/invite/");var invite=new DiaryInvite(id,1L,Instant.now());ReflectionTestUtils.setField(invite,"inviteId",123L);String token=tokens.token(invite);invite.initializeHash(tokens.hash(token));
        var diary=new Diary(id,"test","#FFFFFF","PLAIN","PRIVATE");diary.transferOwnership(1L);
        when(invites.findById(123L)).thenReturn(Optional.of(invite));when(access.lock(id)).thenReturn(diary);when(access.activeUser(anyLong())).thenReturn(mock(com.f106.DIO.user.domain.User.class));when(members.findById(any())).thenReturn(Optional.empty());when(members.countByDiaryIdAndLeftAtIsNull(id)).thenReturn(1L);when(access.cursorColor(id)).thenReturn("#111111");when(access.visibleMembers(diary)).thenReturn(List.of());when(invites.pendingEmail(id,2L)).thenReturn(Optional.empty());
        var blocks=mock(com.f106.DIO.moderation.service.BlockService.class);when(blocks.targets(anyLong())).thenReturn(Set.of());
        new DiaryInviteService(access,members,invites,tokens,mock(jakarta.persistence.EntityManager.class),blocks,events, org.mockito.Mockito.mock(com.f106.DIO.inventory.InventoryLimits.class)).accept(token,2L);
        verify(events).publishEvent(new DiaryMembershipChanged(id));

        reset(events);verifyNoInteractions(events);
        org.junit.jupiter.api.Assertions.assertThrows(com.f106.DIO.sharing.exception.SharingException.class,()->new DiaryOwnershipService(access,events).transfer(id,1L,1L));
        verifyNoInteractions(events);
    }
}
