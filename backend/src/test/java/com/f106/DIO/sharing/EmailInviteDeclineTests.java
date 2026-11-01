package com.f106.DIO.sharing;

import com.f106.DIO.sharing.domain.DiaryInvite;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.repository.DiaryInviteRepository;
import com.f106.DIO.sharing.service.EmailInviteService;
import com.f106.DIO.sharing.service.SharingAccessService;
import com.f106.DIO.sharing.support.InviteTokens;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class EmailInviteDeclineTests {
    private final SharingAccessService access=mock(SharingAccessService.class);
    private final DiaryInviteRepository invites=mock(DiaryInviteRepository.class);
    private final InviteTokens tokens=mock(InviteTokens.class);
    private final EntityManager entities=mock(EntityManager.class);
    private EmailInviteService service(){
        var service=new EmailInviteService(access,invites,null,null,tokens,null,null,null,
            mock(PlatformTransactionManager.class),null);
        ReflectionTestUtils.setField(service,"entities",entities);
        when(tokens.notFound()).thenAnswer(call->new SharingException(org.springframework.http.HttpStatus.NOT_FOUND,"INVITE_NOT_FOUND","not found"));
        return service;
    }
    @Test void missingForeignAndLinkInvitesAreIndistinguishableAndNeverLockADiary(){
        var service=service();var diary=UUID.randomUUID();
        for(var row:java.util.List.of(Optional.<DiaryInvite>empty(),
                Optional.of(DiaryInvite.email(diary,1L,2L,Instant.now())),
                Optional.of(new DiaryInvite(diary,1L,Instant.now())))){
            when(invites.findById(10L)).thenReturn(row);
            assertThatThrownBy(()->service.decline(10L,3L)).isInstanceOfSatisfying(SharingException.class,
                error->assertThat(error.code).isEqualTo("INVITE_NOT_FOUND"));
        }
        verify(access,never()).lock(any());verifyNoInteractions(entities);
    }
    @Test void recipientDeclinesOnlyAfterTheLockAndFreshStateCheck(){
        var service=service();var invite=DiaryInvite.email(UUID.randomUUID(),1L,2L,Instant.now());
        when(invites.findById(10L)).thenReturn(Optional.of(invite));
        service.decline(10L,2L);
        var order=inOrder(invites,access,entities);
        order.verify(invites).findById(10L);order.verify(access).lock(invite.getDiaryId());
        order.verify(entities).refresh(invite);order.verify(invites).findById(10L);
        assertThat(invite.status()).isEqualTo("DECLINED");
        service.decline(10L,2L);assertThat(invite.status()).isEqualTo("DECLINED");
    }
    @Test void cancellationCommittedWhileWaitingCannotBeOverwritten(){
        var service=service();var invite=DiaryInvite.email(UUID.randomUUID(),1L,2L,Instant.now());
        when(invites.findById(10L)).thenReturn(Optional.of(invite));
        doAnswer(call->{invite.cancel(Instant.now());return null;}).when(entities).refresh(invite);
        assertThatThrownBy(()->service.decline(10L,2L)).isInstanceOfSatisfying(SharingException.class,
            error->assertThat(error.code).isEqualTo("INVITE_ALREADY_PROCESSED"));
        assertThat(invite.status()).isEqualTo("CANCELLED");
    }
    @Test void deletionCommittedWhileWaitingReturnsTheSameNotFound(){
        var service=service();var invite=DiaryInvite.email(UUID.randomUUID(),1L,2L,Instant.now());
        when(invites.findById(10L)).thenReturn(Optional.of(invite));
        doThrow(new jakarta.persistence.EntityNotFoundException("deleted")).when(entities).refresh(invite);
        assertThatThrownBy(()->service.decline(10L,2L)).isInstanceOfSatisfying(SharingException.class,
            error->{assertThat(error.code).isEqualTo("INVITE_NOT_FOUND");
                assertThat(error.status).isEqualTo(org.springframework.http.HttpStatus.NOT_FOUND);});
        assertThat(invite.pendingEmail()).isTrue();
        verify(invites,times(1)).findById(10L);
    }
}
