package com.f106.DIO.notification;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import com.f106.DIO.notification.dto.NotificationData;
import com.f106.DIO.notification.invitation.InvitationLookup;
import com.f106.DIO.notification.repository.NotificationRepository;
import com.f106.DIO.notification.service.NotificationService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class NotificationInvitationTests {

	NotificationRepository repository = mock(NotificationRepository.class);
	InvitationLookup lookup = mock(InvitationLookup.class);
	@SuppressWarnings("unchecked")
	ObjectProvider<InvitationLookup> provider = mock(ObjectProvider.class);
	NotificationService service = new NotificationService(repository, provider);
	NotificationData row = new NotificationData("9", "DIARY_INVITE", null, null, null, null, Instant.EPOCH);

	@Test
	void joinsOnlyReturnedPageWithTheAuthenticatedRecipientAndCurrentSharedState() {
		when(provider.getIfAvailable()).thenReturn(lookup);
		when(repository.list(7, null, 2)).thenReturn(List.of(row,
			new NotificationData("8", "DIARY_INVITE", null, null, null, null, Instant.EPOCH)));
		InvitationLookup.InvitationTarget current = new InvitationLookup.InvitationTarget("123", "REVOKED", UUID.randomUUID(), false);
		when(lookup.findForRecipient(7, 9)).thenReturn(Optional.of(current));
		var response = service.list(7, null, 1);
		assertThat(response.items().get(0).invitation()).isEqualTo(current);
		verify(lookup).findForRecipient(7, 9);
		verifyNoMoreInteractions(lookup);
	}

	@Test
	void doesNotInventAnActiveInvitationWhenTheSharedModuleIsNotConnected() {
		when(repository.list(7, null, 21)).thenReturn(List.of(row));
		assertThat(service.list(7, null, 20).items().get(0).invitation()).isNull();
	}

	@Test
	void markingReadDoesNotCallOrChangeTheInvitationModule() {
		when(repository.find(7, 9)).thenReturn(Optional.of(row));
		service.markRead(7, 9);
		verifyNoInteractions(provider, lookup);
	}
}
