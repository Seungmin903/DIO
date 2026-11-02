package com.f106.DIO.notification;
import com.f106.DIO.notification.invitation.InvitationLookup;
import com.f106.DIO.notification.repository.NotificationRepository;
import com.f106.DIO.notification.service.NotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
class NotificationActionableCountTests {
 @Test void delegatesToInvitationAuthorityOnce() {
  var repo=mock(NotificationRepository.class);
  @SuppressWarnings("unchecked") ObjectProvider<InvitationLookup> provider=mock(ObjectProvider.class);
  var lookup=mock(InvitationLookup.class);when(provider.getIfAvailable()).thenReturn(lookup);
  when(lookup.countActionableUnread(7)).thenReturn(2L);
  assertThat(new NotificationService(repo,provider).actionableUnreadCount(7)).isEqualTo(2);
  verify(lookup,times(1)).countActionableUnread(7);verifyNoInteractions(repo);
 }
 @Test void unavailableLookupIsNotReportedAsZero() {
  var repo=mock(NotificationRepository.class);
  @SuppressWarnings("unchecked") ObjectProvider<InvitationLookup> provider=mock(ObjectProvider.class);
  assertThat(new NotificationService(repo,provider).actionableUnreadCount(7)).isNull();
  verifyNoInteractions(repo);
 }
}
