package com.f106.DIO.media;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import com.f106.DIO.media.support.MediaMultipartExceptionResolver;

class MediaMultipartExceptionResolverTests {
	private final MediaMultipartExceptionResolver resolver = new MediaMultipartExceptionResolver();

	@Test
	void handlesTooLargeOnlyForMediaPaths() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/media");
		MockHttpServletResponse response = new MockHttpServletResponse();

		var result = resolver.resolveException(request, response, null, new MaxUploadSizeExceededException(5L * 1024 * 1024));

		assertThat(result).isNotNull();
		assertThat(response.getStatus()).isEqualTo(413);
		assertThat(response.getContentAsString()).contains("MEDIA_FILE_TOO_LARGE");
	}

	@Test
	void delegatesOtherMultipartPathsToTheirExistingHandlers() {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/signup");

		var result = resolver.resolveException(request, new MockHttpServletResponse(), null, new MaxUploadSizeExceededException(5L * 1024 * 1024));

		assertThat(result).isNull();
	}
}
