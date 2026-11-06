package com.f106.DIO.sharing;
import com.f106.DIO.sharing.domain.DiaryInvite;
import com.f106.DIO.sharing.repository.DiaryInviteRepository;
import com.f106.DIO.sharing.service.*;
import com.f106.DIO.sharing.support.InviteTokens;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class InviteSignatureTests {
    @Test void forgedSignatureCannotReachDiaryAccessOnEitherPublicPreviewOrAccept() {
        var access=mock(SharingAccessService.class);var members=mock(DiaryMemberRepository.class);
        var invites=mock(DiaryInviteRepository.class);var entities=mock(EntityManager.class);
        var tokens=new InviteTokens(Base64.getEncoder().encodeToString(new byte[32]),"https://dio.test/invite/");
        var invite=new DiaryInvite(UUID.randomUUID(),1L,Instant.now());ReflectionTestUtils.setField(invite,"inviteId",123L);
        invite.initializeHash(tokens.hash(tokens.token(invite)));when(invites.findById(123L)).thenReturn(Optional.of(invite));
        var service=new DiaryInviteService(access,members,invites,tokens,entities,mock(com.f106.DIO.moderation.service.BlockService.class),mock(org.springframework.context.ApplicationEventPublisher.class));
        String forged="123."+"A".repeat(43);
        assertThatThrownBy(()->service.preview(forged)).isInstanceOf(SharingException.class);
        assertThatThrownBy(()->service.accept(forged,2)).isInstanceOf(SharingException.class);
        verifyNoInteractions(access,members,entities);
    }
    @Test void cancellationWhileWaitingForTheParentLockIsRecheckedFromTheDatabase() {
        var access=mock(SharingAccessService.class);var members=mock(DiaryMemberRepository.class);
        var invites=mock(DiaryInviteRepository.class);var entities=mock(EntityManager.class);
        var tokens=new InviteTokens(Base64.getEncoder().encodeToString(new byte[32]),"https://dio.test/invite/");
        UUID id=UUID.randomUUID();var invite=new DiaryInvite(id,1L,Instant.now());ReflectionTestUtils.setField(invite,"inviteId",123L);
        String token=tokens.token(invite);invite.initializeHash(tokens.hash(token));when(invites.findById(123L)).thenReturn(Optional.of(invite));
        doAnswer(call->{invite.cancel(Instant.now());return null;}).when(entities).refresh(invite);
        var service=new DiaryInviteService(access,members,invites,tokens,entities,mock(com.f106.DIO.moderation.service.BlockService.class),mock(org.springframework.context.ApplicationEventPublisher.class));
        assertThatThrownBy(()->service.accept(token,2)).isInstanceOfSatisfying(SharingException.class,e->assertThat(e.code).isEqualTo("INVITE_REVOKED"));
        verify(access).lock(id);verify(entities).refresh(invite);verify(access,never()).initializeOwner(any());verifyNoInteractions(members);
    }
}
