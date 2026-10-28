package com.f106.DIO.page.controller;

import java.net.URI;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import com.f106.DIO.page.dto.CanvasElementBatchRequest;
import com.f106.DIO.page.dto.CanvasElementCreateForm;
import com.f106.DIO.page.dto.CanvasElementCreateRequest;
import com.f106.DIO.page.dto.CanvasElementListResponse;
import com.f106.DIO.page.dto.CanvasElementResponse;
import com.f106.DIO.page.dto.CanvasElementUpdateForm;
import com.f106.DIO.page.dto.CanvasElementUpdateRequest;
import com.f106.DIO.page.service.CanvasElementService;

@RestController
@RequestMapping("/api/v1/pages/{pageId}/elements")
@Tag(name = "캔버스 요소", description = "페이지 위 텍스트·사진·스티커·테이프·획·도형 API")
@SecurityRequirement(name = "bearerAuth")
public class CanvasElementController {

	private final CanvasElementService canvasElementService;

	public CanvasElementController(CanvasElementService canvasElementService) {
		this.canvasElementService = canvasElementService;
	}

	@GetMapping
	@Operation(summary = "캔버스 요소 목록 조회")
	public CanvasElementListResponse list(@PathVariable UUID pageId, @AuthenticationPrincipal Jwt jwt) {
		return canvasElementService.list(pageId, userId(jwt));
	}

	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	@Operation(
		summary = "캔버스 요소 생성",
		description = "캔버스 요소를 생성합니다. Swagger에서는 `application/x-www-form-urlencoded`를 선택하면 요소 속성을 각각 입력할 수 있습니다.",
		requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = {
			@Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = CanvasElementCreateRequest.class)),
			@Content(mediaType = MediaType.APPLICATION_FORM_URLENCODED_VALUE, schema = @Schema(implementation = CanvasElementCreateForm.class))
		})
	)
	public ResponseEntity<CanvasElementResponse> create(@PathVariable UUID pageId,
		@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CanvasElementCreateRequest request) {
		return created(pageId, canvasElementService.create(pageId, request, userId(jwt)));
	}

	@PostMapping(consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
	@Operation(summary = "캔버스 요소 생성 (폼 입력)", description = "Swagger에서 `application/x-www-form-urlencoded`를 선택하면 요소 속성을 각각 입력할 수 있습니다. propertiesJson은 JSON 문자열 한 칸에 입력합니다.")
	public ResponseEntity<CanvasElementResponse> createForm(@PathVariable UUID pageId,
		@AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute CanvasElementCreateForm form) {
		return created(pageId, canvasElementService.create(pageId, form.toRequest(), userId(jwt)));
	}

	@PatchMapping(value = "/{elementId}", consumes = MediaType.APPLICATION_JSON_VALUE)
	@Operation(
		summary = "캔버스 요소 수정",
		description = "캔버스 요소를 부분 수정합니다. Swagger에서는 `application/x-www-form-urlencoded`를 선택하면 수정할 속성을 각각 입력할 수 있습니다.",
		requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = {
			@Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = CanvasElementUpdateRequest.class)),
			@Content(mediaType = MediaType.APPLICATION_FORM_URLENCODED_VALUE, schema = @Schema(implementation = CanvasElementUpdateForm.class))
		})
	)
	public CanvasElementResponse update(@PathVariable UUID pageId, @PathVariable UUID elementId,
		@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CanvasElementUpdateRequest request) {
		return canvasElementService.update(pageId, elementId, request, userId(jwt));
	}

	@PatchMapping(value = "/{elementId}", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
	@Operation(summary = "캔버스 요소 수정 (폼 입력)", description = "Swagger에서 `application/x-www-form-urlencoded`를 선택하면 수정할 요소 속성을 각각 입력할 수 있습니다. propertiesJson은 JSON 문자열 한 칸에 입력합니다.")
	public CanvasElementResponse updateForm(@PathVariable UUID pageId, @PathVariable UUID elementId,
		@AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute CanvasElementUpdateForm form) {
		return canvasElementService.update(pageId, elementId, form.toRequest(), userId(jwt));
	}

	@DeleteMapping("/{elementId}")
	@Operation(summary = "캔버스 요소 삭제", description = "요소를 소프트 삭제합니다.")
	public ResponseEntity<Void> delete(@PathVariable UUID pageId, @PathVariable UUID elementId, @AuthenticationPrincipal Jwt jwt) {
		canvasElementService.delete(pageId, elementId, userId(jwt));
		return ResponseEntity.ok().build();
	}

	@PostMapping("/batch")
	@Operation(summary = "캔버스 요소 일괄 변경", description = "생성·수정·삭제·복구를 하나의 트랜잭션으로 적용합니다.")
	public CanvasElementListResponse batch(@PathVariable UUID pageId, @AuthenticationPrincipal Jwt jwt,
		@Valid @RequestBody CanvasElementBatchRequest request) {
		return canvasElementService.batch(pageId, request, userId(jwt));
	}

	@PostMapping("/{elementId}/restore")
	@Operation(summary = "캔버스 요소 복구")
	public CanvasElementResponse restore(@PathVariable UUID pageId, @PathVariable UUID elementId, @AuthenticationPrincipal Jwt jwt) {
		return canvasElementService.restore(pageId, elementId, userId(jwt));
	}

	private static ResponseEntity<CanvasElementResponse> created(UUID pageId, CanvasElementResponse response) {
		return ResponseEntity.created(URI.create("/api/v1/pages/" + pageId + "/elements/" + response.element().elementId()))
			.body(response);
	}

	private static Long userId(Jwt jwt) { return Long.valueOf(jwt.getSubject()); }
}
