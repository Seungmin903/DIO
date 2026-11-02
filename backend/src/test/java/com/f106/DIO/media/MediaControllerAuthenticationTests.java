package com.f106.DIO.media;

import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.f106.DIO.media.service.MediaService;
import com.f106.DIO.media.support.MediaFileNotFoundException;
import com.f106.DIO.media.library.service.SharedMediaLibraryService;

@SpringBootTest
@AutoConfigureMockMvc
class MediaControllerAuthenticationTests {
	@Autowired MockMvc mvc;
	@MockitoBean MediaService mediaService;
	@MockitoBean SharedMediaLibraryService sharedMediaLibraryService;

	@Test
	void rejectsUnauthenticatedMediaRequests() throws Exception {
		mvc.perform(get("/api/v1/media")).andExpect(status().isUnauthorized());
	}

	@Test
	void rejectsUnauthenticatedSharedLibraryRequests() throws Exception {
		mvc.perform(get("/api/v1/diaries/" + UUID.randomUUID() + "/media-library")).andExpect(status().isUnauthorized());
	}

	@Test
	void addingToTheSharedLibraryReturnsCreatedWithoutAnUnfollowableLocation() throws Exception {
		UUID diaryId = UUID.randomUUID(); UUID mediaFileId = UUID.randomUUID();
		org.mockito.Mockito.when(sharedMediaLibraryService.add(diaryId, mediaFileId, 2L)).thenReturn(new com.f106.DIO.media.library.dto.SharedMediaLibraryItemResponse(
			mediaFileId, "IMAGE", "STICKER", "sticker.png", "image/png", 10, 2L, java.time.Instant.parse("2026-10-29T00:00:00Z")));

		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/diaries/" + diaryId + "/media-library")
				.with(jwt().jwt(token -> token.subject("2"))).contentType(org.springframework.http.MediaType.APPLICATION_JSON)
				.content("{\"mediaFileId\":\"" + mediaFileId + "\"}"))
			.andExpect(status().isCreated())
			.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().doesNotExist("Location"))
			.andExpect(jsonPath("$.mediaFileId").value(mediaFileId.toString()));
	}

	@Test
	void hidesAnotherUsersMediaAsNotFound() throws Exception {
		UUID mediaFileId = UUID.randomUUID();
		doThrow(new MediaFileNotFoundException()).when(mediaService).detail(mediaFileId, 2L);

		mvc.perform(get("/api/v1/media/" + mediaFileId).with(jwt().jwt(token -> token.subject("2"))))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("MEDIA_FILE_NOT_FOUND"));
	}

	@Test
	void sendsPdfSourceFilesAsAttachments() throws Exception {
		UUID mediaFileId = UUID.randomUUID();
		org.mockito.Mockito.when(mediaService.file(mediaFileId, 2L))
			.thenReturn(new MediaService.DownloadedMedia("application/pdf", "layout.pdf", "%PDF-1.7".getBytes()));

		mvc.perform(get("/api/v1/media/" + mediaFileId + "/file").with(jwt().jwt(token -> token.subject("2"))))
			.andExpect(status().isOk())
			.andExpect(header().string("X-Content-Type-Options", "nosniff"))
			.andExpect(header().string("Content-Security-Policy", "sandbox; default-src 'none'"))
			.andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")))
			.andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("layout.pdf")));
	}
}
