package com.f106.DIO.cutout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import com.f106.DIO.cutout.client.CutoutAiClient;
import com.f106.DIO.cutout.dto.CutoutSelectionRequest;
import com.f106.DIO.cutout.support.CutoutException;

class CutoutAiClientTests {
	private final RestClient.Builder builder = CutoutAiClient.builder("http://ai.test", "secret", Duration.ofSeconds(1), Duration.ofSeconds(1));
	private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
	private final CutoutAiClient client = new CutoutAiClient(builder);
	private final CutoutSelectionRequest tap = new CutoutSelectionRequest(List.of(new CutoutSelectionRequest.TapPoint(0.5, 0.4, null)), null);

	@Test
	void uploadSendsInternalKeyAndReadsImageInfo() {
		server.expect(requestTo("http://ai.test/api/stickers/images")).andExpect(header("X-Internal-Key", "secret"))
			.andRespond(withSuccess("{\"imageId\":\"abc\",\"width\":800,\"height\":600,\"embedMs\":1500}", MediaType.APPLICATION_JSON));

		var image = client.upload(new byte[] {1, 2, 3});

		assertThat(image.imageId()).isEqualTo("abc");
		assertThat(image.width()).isEqualTo(800);
		server.verify();
	}

	@Test
	void segmentForwardsSelectionWithoutNullFields() {
		server.expect(requestTo("http://ai.test/api/stickers/segment"))
			.andExpect(content().json("{\"imageId\":\"abc\",\"points\":[{\"x\":0.5,\"y\":0.4}]}", org.springframework.test.json.JsonCompareMode.STRICT))
			.andRespond(withSuccess("{\"preview\":\"data:image/png;base64,AA\",\"segmentMs\":120,\"promptPoints\":1}", MediaType.APPLICATION_JSON));

		var preview = client.segment("abc", tap);

		assertThat(preview.preview()).startsWith("data:image/png");
		assertThat(preview.segmentMs()).isEqualTo(120);
	}

	@Test
	void renderReturnsPngBytes() {
		byte[] png = {(byte) 0x89, 'P', 'N', 'G'};
		server.expect(requestTo("http://ai.test/api/stickers/render")).andRespond(withSuccess(png, MediaType.IMAGE_PNG));

		assertThat(client.render("abc", tap)).isEqualTo(png);
	}

	@Test
	void aiErrorCodesBecomeCutoutCodes() {
		expectError(HttpStatus.NOT_FOUND, "{\"code\":\"IMAGE_EXPIRED\",\"message\":\"x\"}", "CUTOUT_EXPIRED");
		expectError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "{\"code\":\"UNSUPPORTED_FORMAT\",\"message\":\"x\"}", "CUTOUT_UNSUPPORTED_FORMAT");
		expectError(HttpStatus.UNPROCESSABLE_CONTENT, "{\"code\":\"EMPTY_SELECTION\",\"message\":\"x\"}", "CUTOUT_EMPTY_SELECTION");
		expectError(HttpStatus.UNPROCESSABLE_CONTENT, "{\"detail\":[{\"loc\":[\"body\"]}]}", "CUTOUT_INVALID_SELECTION");
		expectError(HttpStatus.UNAUTHORIZED, "{\"code\":\"UNAUTHORIZED\",\"message\":\"x\"}", "CUTOUT_UNAVAILABLE");
		expectError(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error", "CUTOUT_UNAVAILABLE");
	}

	@Test
	void connectionFailureIsUnavailable() {
		server.expect(requestTo("http://ai.test/api/stickers/segment")).andRespond(withException(new IOException("refused")));

		assertThatThrownBy(() -> client.segment("abc", tap)).isInstanceOf(CutoutException.class)
			.extracting(error -> ((CutoutException) error).code()).isEqualTo("CUTOUT_UNAVAILABLE");
	}

	private void expectError(HttpStatus status, String body, String code) {
		server.reset();
		server.expect(requestTo("http://ai.test/api/stickers/segment")).andRespond(withStatus(status).contentType(MediaType.APPLICATION_JSON).body(body));
		assertThatThrownBy(() -> client.segment("abc", tap)).isInstanceOf(CutoutException.class)
			.extracting(error -> ((CutoutException) error).code()).isEqualTo(code);
	}
}
