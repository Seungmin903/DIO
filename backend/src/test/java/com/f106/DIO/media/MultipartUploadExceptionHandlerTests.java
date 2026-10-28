package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import com.f106.DIO.media.support.MultipartUploadExceptionHandler;

class MultipartUploadExceptionHandlerTests {
	private final MultipartUploadExceptionHandler handler = new MultipartUploadExceptionHandler();

	@Test
	void usesMediaSpecificProblemCodeBeforeTheControllerIsSelected() {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/media");

		var response = handler.tooLarge(request);

		assertThat(response.getStatusCode().value()).isEqualTo(413);
		assertThat(response.getBody().getProperties()).containsEntry("code", "MEDIA_FILE_TOO_LARGE");
	}

	@Test
	void usesGenericProblemCodeForOtherMultipartEndpoints() {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/signup");

		var response = handler.tooLarge(request);

		assertThat(response.getBody().getProperties()).containsEntry("code", "REQUEST_TOO_LARGE");
	}
}
