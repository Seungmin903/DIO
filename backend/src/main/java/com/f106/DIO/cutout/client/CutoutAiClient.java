package com.f106.DIO.cutout.client;

import java.time.Duration;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import com.f106.DIO.cutout.dto.CutoutSelectionRequest;
import com.f106.DIO.cutout.support.CutoutException;

/** ai/ 서버(FastAPI + SAM 2) 내부 호출. 오류는 AI 서버의 {code, message}를 앱용 CutoutException 으로 바꾼다. */
@Component
public class CutoutAiClient {
	private static final Logger log = LoggerFactory.getLogger(CutoutAiClient.class);
	private static final String KEY_HEADER = "X-Internal-Key";
	private final RestClient client;

	@Autowired
	public CutoutAiClient(@Value("${dio.cutout.ai-base-url:http://localhost:8000}") String baseUrl, @Value("${dio.cutout.ai-key:}") String key,
			@Value("${dio.cutout.connect-timeout:PT3S}") Duration connectTimeout, @Value("${dio.cutout.read-timeout:PT30S}") Duration readTimeout) {
		this(builder(baseUrl, key, connectTimeout, readTimeout));
	}
	public CutoutAiClient(RestClient.Builder builder) { this.client = builder.build(); }

	public static RestClient.Builder builder(String baseUrl, String key, Duration connectTimeout, Duration readTimeout) {
		var factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(connectTimeout); factory.setReadTimeout(readTimeout);
		var builder = RestClient.builder().baseUrl(baseUrl).requestFactory(factory);
		if (key != null && !key.isBlank()) builder.defaultHeader(KEY_HEADER, key);
		return builder;
	}

	public UploadedImage upload(byte[] photo) {
		var parts = new MultipartBodyBuilder();
		parts.part("file", new ByteArrayResource(photo)).filename("photo");
		return call(() -> client.post().uri("/api/stickers/images").contentType(MediaType.MULTIPART_FORM_DATA)
			.body(parts.build()).retrieve().body(UploadedImage.class));
	}

	public Preview segment(String imageId, CutoutSelectionRequest selection) {
		return call(() -> client.post().uri("/api/stickers/segment").contentType(MediaType.APPLICATION_JSON)
			.body(Selection.of(imageId, selection)).retrieve().body(Preview.class));
	}

	public byte[] render(String imageId, CutoutSelectionRequest selection) {
		return call(() -> client.post().uri("/api/stickers/render").contentType(MediaType.APPLICATION_JSON)
			.accept(MediaType.IMAGE_PNG).body(Selection.of(imageId, selection)).retrieve().body(byte[].class));
	}

	private static <T> T call(java.util.function.Supplier<T> request) {
		T body;
		try { body = request.get(); }
		catch (RestClientResponseException error) { throw translate(error.getStatusCode(), errorBody(error)); }
		catch (RestClientException error) {
			log.warn("AI 서버 호출 실패: {}", error.getMessage());
			throw CutoutException.unavailable();
		}
		if (body == null) throw CutoutException.unavailable();
		return body;
	}

	private static AiError errorBody(RestClientResponseException error) {
		try { return error.getResponseBodyAs(AiError.class); }
		catch (RuntimeException unreadable) { return null; } // FastAPI 기본 422({detail: [...]}) 등 형식이 다른 본문
	}

	static CutoutException translate(HttpStatusCode status, AiError error) {
		String code = error == null ? null : error.code();
		if (code != null) switch (code) {
			case "IMAGE_EXPIRED": return CutoutException.expired();
			case "INVALID_IMAGE": return CutoutException.invalidImage();
			case "UNSUPPORTED_FORMAT": return CutoutException.unsupportedFormat();
			case "IMAGE_TOO_LARGE": return CutoutException.imageTooLarge();
			case "NO_INCLUDE": return CutoutException.noInclude();
			case "EMPTY_SELECTION": return CutoutException.emptySelection();
			default: break;
		}
		if (status.value() == 422 || status.value() == 400) return CutoutException.invalidSelection();
		// 401(내부 키 불일치)·5xx 는 서버 설정 문제라 사용자에게는 일시적 장애로 보인다.
		log.warn("AI 서버 오류 응답: status={}, code={}", status.value(), code);
		return CutoutException.unavailable();
	}

	public record UploadedImage(String imageId, int width, int height, long embedMs) {}
	public record Preview(String preview, long segmentMs) {}
	@JsonIgnoreProperties(ignoreUnknown = true) record AiError(String code, String message) {}
	@JsonInclude(JsonInclude.Include.NON_NULL) record Selection(String imageId, List<CutoutSelectionRequest.TapPoint> points, List<CutoutSelectionRequest.Stroke> strokes) {
		static Selection of(String imageId, CutoutSelectionRequest selection) {
			return new Selection(imageId, selection.points(), selection.strokes());
		}
	}
}
