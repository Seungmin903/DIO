package com.f106.DIO.auth;

import static org.assertj.core.api.Assertions.assertThat;
import com.f106.DIO.auth.service.MyProfileService;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.domain.DiaryMembershipChanged;
import com.f106.DIO.user.dto.ProfileUpdateRequest;
import com.f106.DIO.user.repository.*;
import com.f106.DIO.user.service.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import static org.mockito.Mockito.*;

class MyProfileMembershipEventTests {
    @Test void membershipEventIsPublishedOnlyWhenVisibleAccountProfileChanges(){
        assertThat(MyProfileService.membershipAppearanceChanged(true,false,false)).isTrue();
        assertThat(MyProfileService.membershipAppearanceChanged(false,true,false)).isTrue();
        assertThat(MyProfileService.membershipAppearanceChanged(false,false,true)).isTrue();
        assertThat(MyProfileService.membershipAppearanceChanged(false,false,false)).isFalse();
    }
    @Test void profileUpdatePublishesForEveryActiveDiaryOnlyWhenAccountAppearanceChanges(){
        long userId=7L;UUID first=UUID.randomUUID(),second=UUID.randomUUID();var users=mock(UserRepository.class);var members=mock(DiaryMemberRepository.class);var events=mock(ApplicationEventPublisher.class);var manager=mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        var user=mock(com.f106.DIO.user.domain.User.class);when(user.isActive()).thenReturn(true);when(user.getNickname()).thenReturn("기존이름");when(users.findById(userId)).thenReturn(Optional.of(user));when(members.activeDiaryIdsByUserId(userId)).thenReturn(List.of(first,second));
        var service=new MyProfileService(users,mock(ProfilePhotoRepository.class),mock(UserPhotoService.class),mock(UserWithdrawalService.class),members,manager,events);
        service.update(userId,new ProfileUpdateRequest("새이름",false),null);
        verify(events).publishEvent(new DiaryMembershipChanged(first));verify(events).publishEvent(new DiaryMembershipChanged(second));
        reset(events);service.update(userId,new ProfileUpdateRequest("기존이름",false),null);verifyNoInteractions(events);
    }
}
