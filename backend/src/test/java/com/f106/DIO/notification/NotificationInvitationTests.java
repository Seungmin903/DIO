package com.f106.DIO.notification;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Map;
import java.util.stream.LongStream;
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
		when(lookup.findForRecipient(7, List.of(9L))).thenReturn(Map.of(9L, current));
		var response = service.list(7, null, 1);
		assertThat(response.items().get(0).invitation()).isEqualTo(current);
		verify(lookup).findForRecipient(7, List.of(9L));
		verifyNoMoreInteractions(lookup);
	}

	@Test
	void doesNotInventAnActiveInvitationWhenTheSharedModuleIsNotConnected() {
		when(repository.list(7, null, 21)).thenReturn(List.of(row));
		assertThat(service.list(7, null, 20).items().get(0).invitation()).isNull();
	}

	@Test
	void batchesTheMaximumPageOnceAndKeepsMissingTargetsAndPageOrder() {
		when(provider.getIfAvailable()).thenReturn(lookup);
		var rows = LongStream.rangeClosed(1, 101).mapToObj(id ->
			new NotificationData(Long.toString(id), "DIARY_INVITE", null, null, null, null, Instant.EPOCH)).toList();
		var ids = LongStream.rangeClosed(1, 100).boxed().toList();
		when(repository.list(7, null, 101)).thenReturn(rows);
		var current = new InvitationLookup.InvitationTarget("123", "PENDING", UUID.randomUUID(), true);
		when(lookup.findForRecipient(7, ids)).thenReturn(Map.of(2L, current, 101L, current));
		var response = service.list(7, null, 100);
		assertThat(response.items()).hasSize(100);
		assertThat(response.hasNext()).isTrue();
		assertThat(response.items().get(0).invitation()).isNull();
		assertThat(response.items().get(1).invitation()).isEqualTo(current);
		assertThat(response.items().get(99).notification().notificationId()).isEqualTo("100");
		verify(lookup).findForRecipient(7, ids);
		verifyNoMoreInteractions(lookup);
	}

	@Test
	void skipsTheSharedLookupForAnEmptyPage() {
		when(provider.getIfAvailable()).thenReturn(lookup);
		when(repository.list(7, null, 21)).thenReturn(List.of());
		assertThat(service.list(7, null, 20).items()).isEmpty();
		verifyNoInteractions(lookup);
	}

	@Test
	void markingReadDoesNotCallOrChangeTheInvitationModule() {
		when(repository.find(7, 9)).thenReturn(Optional.of(row));
		service.markRead(7, 9);
		verifyNoInteractions(provider, lookup);
	}
}
