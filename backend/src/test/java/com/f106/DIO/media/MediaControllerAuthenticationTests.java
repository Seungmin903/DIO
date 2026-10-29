package com.f106.DIO.media;

import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
	void hidesAnotherUsersMediaAsNotFound() throws Exception {
		UUID mediaFileId = UUID.randomUUID();
		doThrow(new MediaFileNotFoundException()).when(mediaService).detail(mediaFileId, 2L);

		mvc.perform(get("/api/v1/media/" + mediaFileId).with(jwt().jwt(token -> token.subject("2"))))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("MEDIA_FILE_NOT_FOUND"));
	}
}
