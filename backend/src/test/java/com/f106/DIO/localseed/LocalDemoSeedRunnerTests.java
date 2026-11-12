package com.f106.DIO.localseed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.Optional;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.page.domain.CanvasElement;
import com.f106.DIO.page.domain.DiaryPage;
import com.f106.DIO.page.repository.CanvasElementRepository;
import com.f106.DIO.page.repository.DiaryPageRepository;
import com.f106.DIO.user.infrastructure.storage.LocalProfilePhotoStorage;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;

class LocalDemoSeedRunnerTests {

	@TempDir Path temporaryDirectory;

	@Test
	void importsTheLocalFileWithStableIdsAndSkipsExistingRows() throws Exception {
		Path seed = temporaryDirectory.resolve("demo.json");
		Files.writeString(seed, """
			{"users":[{"email":"seed@example.com","nickname":"시드"}],"diaries":[{"diaryId":"d1000000-0000-4000-8000-000000000001","ownerEmail":"seed@example.com","title":"데모","pages":[
				{"pageId":"d1000000-0000-4000-8000-000000000101","title":"첫 페이지","elements":[
					{"elementId":"d1000000-0000-4000-8000-000000001001","elementType":"TEXT","x":1,"y":2,"width":3,"height":4,"propertiesJson":{"text":"안녕"}}
				]}
			]}]}
			""");
		DiaryRepository diaries = mock(DiaryRepository.class);
		DiaryMemberRepository members = mock(DiaryMemberRepository.class);
		DiaryPageRepository pages = mock(DiaryPageRepository.class);
		CanvasElementRepository elements = mock(CanvasElementRepository.class);
		UserRepository users = mock(UserRepository.class);
		ProfilePhotoRepository photos = mock(ProfilePhotoRepository.class);
		LocalProfilePhotoStorage localPhotoStorage = mock(LocalProfilePhotoStorage.class);
		EmailAuthProviderRepository accounts = mock(EmailAuthProviderRepository.class);
		User owner = new User("seed@example.com", "시드", Instant.now());
		org.springframework.test.util.ReflectionTestUtils.setField(owner, "userId", 1L);
		when(users.findByEmail("seed@example.com")).thenReturn(Optional.of(owner));
		LocalDemoSeedRunner runner = new LocalDemoSeedRunner(diaries, members, pages, elements, users, photos, localPhotoStorage, accounts, seed.toString());

		runner.run(null);

		var diary = org.mockito.ArgumentCaptor.forClass(Diary.class);
		var page = org.mockito.ArgumentCaptor.forClass(DiaryPage.class);
		var element = org.mockito.ArgumentCaptor.forClass(CanvasElement.class);
		verify(diaries).saveAndFlush(diary.capture());
		verify(pages).saveAndFlush(page.capture());
		verify(elements).saveAndFlush(element.capture());
		assertThat(diary.getValue().getDiaryId()).isEqualTo(UUID.fromString("d1000000-0000-4000-8000-000000000001"));
		assertThat(page.getValue().getDiaryId()).isEqualTo(diary.getValue().getDiaryId());
		assertThat(element.getValue().getPageId()).isEqualTo(UUID.fromString("d1000000-0000-4000-8000-000000000101"));
		assertThat(element.getValue().getPropertiesJson()).isEqualTo("{\"text\":\"안녕\"}");

		clearInvocations(diaries, members, pages, elements, users, photos, localPhotoStorage, accounts);
		when(diaries.findById(any(UUID.class))).thenReturn(Optional.of(diary.getValue()));
		when(pages.existsById(any(UUID.class))).thenReturn(true);
		when(elements.existsById(any(UUID.class))).thenReturn(true);
		runner.run(null);
		verify(diaries, never()).saveAndFlush(any(Diary.class));
		verify(pages, never()).saveAndFlush(any(DiaryPage.class));
		verify(elements, never()).saveAndFlush(any(CanvasElement.class));
	}
}
