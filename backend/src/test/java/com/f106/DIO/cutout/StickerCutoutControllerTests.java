package com.f106.DIO.cutout;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.f106.DIO.cutout.dto.CutoutCreatedResponse;
import com.f106.DIO.cutout.dto.CutoutPreviewResponse;
import com.f106.DIO.cutout.service.StickerCutoutService;
import com.f106.DIO.cutout.support.CutoutException;
import com.f106.DIO.media.dto.MediaFileResponse;

class StickerCutoutControllerTests extends com.f106.DIO.support.MockedMediaServicesWebTestSupport {
	private static final String TAP = "{\"points\":[{\"x\":0.5,\"y\":0.5,\"label\":1}]}";

	@Test
	void guestsMustLogIn() throws Exception {
		mvc.perform(multipart("/api/v1/sticker-cutouts").file(photo())).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/v1/sticker-cutouts/" + UUID.randomUUID() + "/segment").contentType(MediaType.APPLICATION_JSON).content(TAP))
			.andExpect(status().isUnauthorized());
		verifyNoInteractions(stickerCutoutService);
	}

	@Test
	void uploadReturnsCutoutId() throws Exception {
		UUID cutoutId = UUID.randomUUID();
		when(stickerCutoutService.open(any(), eq(7L))).thenReturn(new CutoutCreatedResponse(cutoutId, 800, 600, Instant.parse("2026-11-01T00:30:00Z")));

		mvc.perform(multipart("/api/v1/sticker-cutouts").file(photo()).with(user()))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.cutoutId").value(cutoutId.toString()))
			.andExpect(jsonPath("$.width").value(800));
	}

	@Test
	void segmentReturnsPreview() throws Exception {
		UUID cutoutId = UUID.randomUUID();
		when(stickerCutoutService.segment(eq(cutoutId), any(), eq(7L))).thenReturn(new CutoutPreviewResponse("data:image/png;base64,AA", 120));

		mvc.perform(post("/api/v1/sticker-cutouts/" + cutoutId + "/segment").with(user()).contentType(MediaType.APPLICATION_JSON).content(TAP))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.preview").value("data:image/png;base64,AA"));
	}

	@Test
	void renderReturnsPng() throws Exception {
		UUID cutoutId = UUID.randomUUID();
		byte[] png = {(byte) 0x89, 'P', 'N', 'G'};
		when(stickerCutoutService.render(eq(cutoutId), any(), eq(7L))).thenReturn(png);

		mvc.perform(post("/api/v1/sticker-cutouts/" + cutoutId + "/render").with(user()).contentType(MediaType.APPLICATION_JSON).content(TAP))
			.andExpect(status().isOk())
			.andExpect(content().contentType(MediaType.IMAGE_PNG))
			.andExpect(content().bytes(png));
	}

	@Test
	void saveCreatesStickerMedia() throws Exception {
		UUID cutoutId = UUID.randomUUID(); UUID mediaFileId = UUID.randomUUID();
		when(stickerCutoutService.save(eq(cutoutId), any(), eq(7L))).thenReturn(new MediaFileResponse(mediaFileId, "IMAGE", "AI_RESULT", "STICKER",
			null, "image/png", 100, "0".repeat(64), Instant.parse("2026-11-01T00:00:00Z")));

		mvc.perform(post("/api/v1/sticker-cutouts/" + cutoutId + "/save").with(user()).contentType(MediaType.APPLICATION_JSON).content(TAP))
			.andExpect(status().isCreated())
			.andExpect(header().string("Location", "/api/v1/media/" + mediaFileId))
			.andExpect(jsonPath("$.sourceType").value("AI_RESULT"))
			.andExpect(jsonPath("$.libraryCategory").value("STICKER"));
	}

	@Test
	void selectionMustBeExactlyOneKind() throws Exception {
		String both = "{\"points\":[{\"x\":0.5,\"y\":0.5}],\"strokes\":[{\"mode\":\"include\",\"size\":0.1,\"points\":[{\"x\":0.5,\"y\":0.5}]}]}";
		for (String body : new String[] {"{}", both, "{\"points\":[{\"x\":1.5,\"y\":0.5}]}", "{\"strokes\":[{\"mode\":\"paint\",\"size\":0.1,\"points\":[{\"x\":0.5,\"y\":0.5}]}]}"}) {
			mvc.perform(post("/api/v1/sticker-cutouts/" + UUID.randomUUID() + "/segment").with(user()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("CUTOUT_INVALID_SELECTION"));
		}
		verifyNoInteractions(stickerCutoutService);
	}

	@Test
	void cutoutErrorsUseProblemDetailWithCode() throws Exception {
		UUID cutoutId = UUID.randomUUID();
		when(stickerCutoutService.segment(eq(cutoutId), any(), eq(7L))).thenThrow(CutoutException.expired());
		mvc.perform(post("/api/v1/sticker-cutouts/" + cutoutId + "/segment").with(user()).contentType(MediaType.APPLICATION_JSON).content(TAP))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("CUTOUT_EXPIRED"));

		when(stickerCutoutService.open(any(), eq(7L))).thenThrow(CutoutException.busy());
		mvc.perform(multipart("/api/v1/sticker-cutouts").file(photo()).with(user()))
			.andExpect(status().isServiceUnavailable())
			.andExpect(header().string("Retry-After", "2"));
	}

	@Test
	void webFrontendOriginPassesCorsPreflight() throws Exception {
		mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options("/api/v1/sticker-cutouts/" + UUID.randomUUID() + "/segment")
				.header("Origin", "http://localhost:8081").header("Access-Control-Request-Method", "POST")
				.header("Access-Control-Request-Headers", "authorization,content-type"))
			.andExpect(status().isOk())
			.andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8081"));
		verifyNoInteractions(stickerCutoutService);
	}

	private static MockMultipartFile photo() { return new MockMultipartFile("file", "photo.jpg", "image/jpeg", new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}); }
	private static org.springframework.test.web.servlet.request.RequestPostProcessor user() { return jwt().jwt(token -> token.subject("7")); }
}
