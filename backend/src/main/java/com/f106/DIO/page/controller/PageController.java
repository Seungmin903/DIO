package com.f106.DIO.page.controller;

import java.net.URI;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import com.f106.DIO.page.dto.PageCreateForm;
import com.f106.DIO.page.dto.PageCreateRequest;
import com.f106.DIO.page.dto.PageDetailResponse;
import com.f106.DIO.page.dto.PageListResponse;
import com.f106.DIO.page.dto.PageOrderRequest;
import com.f106.DIO.page.dto.PageResponse;
import com.f106.DIO.page.dto.PageUpdateForm;
import com.f106.DIO.page.dto.PageUpdateRequest;
import com.f106.DIO.page.service.PageService;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "페이지", description = "다이어리 페이지와 속지 설정 API")
@SecurityRequirement(name = "bearerAuth")
public class PageController {

	private final PageService pageService;

	public PageController(PageService pageService) {
		this.pageService = pageService;
	}

	@PostMapping(value = "/diaries/{diaryId}/pages", consumes = MediaType.APPLICATION_JSON_VALUE)
	@Operation(
		summary = "다이어리 페이지 생성",
		description = "다이어리 마지막에 페이지를 추가합니다. Swagger에서는 `application/x-www-form-urlencoded`를 선택하면 필드별 입력칸을 사용할 수 있습니다.",
		requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = {
			@Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = PageCreateRequest.class)),
			@Content(mediaType = MediaType.APPLICATION_FORM_URLENCODED_VALUE, schema = @Schema(implementation = PageCreateForm.class))
		})
	)
	public ResponseEntity<PageResponse> create(@PathVariable UUID diaryId, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PageCreateRequest request) {
		return created(pageService.create(diaryId, request, userId(jwt)));
	}

	@PostMapping(value = "/diaries/{diaryId}/pages", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
	@Operation(summary = "다이어리 페이지 생성 (폼 입력)", description = "Swagger에서 `application/x-www-form-urlencoded`를 선택하면 필드별 입력칸으로 페이지를 생성합니다. templateConfig는 JSON 문자열 한 칸에 입력합니다.")
	public ResponseEntity<PageResponse> createForm(@PathVariable UUID diaryId, @AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute PageCreateForm form) {
		return created(pageService.create(diaryId, form.toRequest(), userId(jwt)));
	}

	@GetMapping("/diaries/{diaryId}/pages")
	@Operation(summary = "다이어리 페이지 목록 조회", description = "삭제되지 않은 페이지를 sortKey 오름차순으로 조회합니다.")
	public PageListResponse list(@PathVariable UUID diaryId, @AuthenticationPrincipal Jwt jwt) {
		return pageService.list(diaryId, userId(jwt));
	}

	@PatchMapping("/diaries/{diaryId}/pages/order")
	@Operation(summary = "페이지 순서 변경", description = "삭제되지 않은 페이지 ID 전체를 원하는 순서로 전달합니다.")
	public PageListResponse reorder(@PathVariable UUID diaryId, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PageOrderRequest request) {
		return pageService.reorder(diaryId, request, userId(jwt));
	}

	@GetMapping("/pages/{pageId}")
	@Operation(summary = "페이지 상세 조회", description = "페이지 설정과 삭제되지 않은 캔버스 요소를 함께 조회합니다.")
	public PageDetailResponse detail(@PathVariable UUID pageId, @AuthenticationPrincipal Jwt jwt) {
		return pageService.detail(pageId, userId(jwt));
	}

	@PatchMapping(value = "/pages/{pageId}", consumes = MediaType.APPLICATION_JSON_VALUE)
	@Operation(
		summary = "페이지 설정 수정",
		description = "제목, 속지, 캔버스 크기, 격자 설정을 부분 수정합니다. Swagger에서는 `application/x-www-form-urlencoded`를 선택하면 수정할 필드를 각각 입력할 수 있습니다.",
		requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = {
			@Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = PageUpdateRequest.class)),
			@Content(mediaType = MediaType.APPLICATION_FORM_URLENCODED_VALUE, schema = @Schema(implementation = PageUpdateForm.class))
		})
	)
	public PageResponse update(@PathVariable UUID pageId, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PageUpdateRequest request) {
		return pageService.update(pageId, request, userId(jwt));
	}

	@PatchMapping(value = "/pages/{pageId}", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
	@Operation(summary = "페이지 설정 수정 (폼 입력)", description = "Swagger에서 `application/x-www-form-urlencoded`를 선택하면 수정할 필드만 각각 입력할 수 있습니다. templateConfig는 JSON 문자열 한 칸에 입력합니다.")
	public PageResponse updateForm(@PathVariable UUID pageId, @AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute PageUpdateForm form) {
		return pageService.update(pageId, form.toRequest(), userId(jwt));
	}

	@DeleteMapping("/pages/{pageId}")
	@Operation(summary = "페이지 삭제", description = "페이지를 소프트 삭제합니다.")
	@ApiResponse(responseCode = "204", description = "페이지 삭제 성공", content = @Content)
	public ResponseEntity<Void> delete(@PathVariable UUID pageId, @AuthenticationPrincipal Jwt jwt) {
		pageService.delete(pageId, userId(jwt));
		return ResponseEntity.noContent().build();
	}

	@PostMapping("/pages/{pageId}/copies")
	@Operation(summary = "페이지 복사", description = "속지 설정과 삭제되지 않은 캔버스 요소를 복제해 다이어리 마지막에 추가합니다.")
	@ApiResponse(
		responseCode = "201",
		description = "페이지 복사 성공",
		content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = PageResponse.class))
	)
	public ResponseEntity<PageResponse> copy(@PathVariable UUID pageId, @AuthenticationPrincipal Jwt jwt) {
		return created(pageService.copy(pageId, userId(jwt)));
	}

	private static ResponseEntity<PageResponse> created(PageResponse response) {
		return ResponseEntity.created(URI.create("/api/v1/pages/" + response.page().pageId())).body(response);
	}

	private static Long userId(Jwt jwt) { return Long.valueOf(jwt.getSubject()); }
}
