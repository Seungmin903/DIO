package com.f106.DIO.page.controller;

import java.net.URI;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.f106.DIO.page.dto.PageCreateRequest;
import com.f106.DIO.page.dto.PageDetailResponse;
import com.f106.DIO.page.dto.PageListResponse;
import com.f106.DIO.page.dto.PageOrderRequest;
import com.f106.DIO.page.dto.PageResponse;
import com.f106.DIO.page.dto.PageUpdateRequest;
import com.f106.DIO.page.service.PageService;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "페이지", description = "다이어리 페이지와 속지 설정 API. 캔버스 요소는 별도 API에서 관리합니다.")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "잘못된 요청 또는 ID", content = @Content(
		mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class))),
	@ApiResponse(responseCode = "404", description = "다이어리·페이지·속지 없음", content = @Content(
		mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class)))
})
public class PageController {

	private final PageService pageService;

	public PageController(PageService pageService) {
		this.pageService = pageService;
	}

	@PostMapping("/diaries/{diaryId}/pages")
	@Operation(summary = "다이어리 페이지 생성", description = "다이어리 맨 뒤에 페이지를 추가합니다. 속지를 지정하면 속지의 크기와 기본 설정을 사용합니다.")
	@ApiResponse(responseCode = "201", description = "페이지 생성 성공", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = PageResponse.class)))
	public ResponseEntity<PageResponse> createPage(@PathVariable UUID diaryId, @Valid @RequestBody PageCreateRequest request) {
		PageResponse response = pageService.create(diaryId, request);
		return ResponseEntity.created(URI.create("/api/v1/pages/" + response.page().pageId())).body(response);
	}

	@GetMapping("/diaries/{diaryId}/pages")
	@Operation(summary = "다이어리 페이지 목록 조회", description = "삭제되지 않은 페이지를 순서대로 조회합니다. 요소는 포함하지 않습니다.")
	@ApiResponse(responseCode = "200", description = "페이지 목록 조회 성공", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = PageListResponse.class)))
	public PageListResponse getPages(@PathVariable UUID diaryId) {
		return pageService.list(diaryId);
	}

	@PutMapping("/diaries/{diaryId}/pages/order")
	@Operation(summary = "페이지 순서 변경", description = "삭제되지 않은 모든 페이지 ID를 원하는 순서대로 중복 없이 전달합니다.")
	@ApiResponse(responseCode = "200", description = "순서 변경 성공, 변경된 목록 반환", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = PageListResponse.class)))
	public PageListResponse reorderPages(@PathVariable UUID diaryId, @Valid @RequestBody PageOrderRequest request) {
		return pageService.reorder(diaryId, request);
	}

	@GetMapping("/pages/{pageId}")
	@Operation(summary = "페이지 상세 조회", description = "페이지 설정과 삭제되지 않은 캔버스 요소를 레이어 순서대로 함께 조회합니다.")
	@ApiResponse(responseCode = "200", description = "페이지 상세 조회 성공", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = PageDetailResponse.class)))
	public PageDetailResponse getPage(@PathVariable UUID pageId) {
		return pageService.detail(pageId);
	}

	@PatchMapping("/pages/{pageId}")
	@Operation(summary = "페이지 설정 수정", description = "속지·제목·캔버스 크기·격자 설정 중 하나 이상 전달합니다. 생략한 필드는 유지합니다.")
	@ApiResponse(responseCode = "200", description = "페이지 설정 수정 성공", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = PageResponse.class)))
	public PageResponse updatePage(@PathVariable UUID pageId, @Valid @RequestBody PageUpdateRequest request) {
		return pageService.update(pageId, request);
	}

	@PostMapping("/pages/{pageId}/copy")
	@Operation(summary = "페이지 복사", description = "페이지 설정과 삭제되지 않은 요소를 복제해 다이어리 맨 뒤에 추가합니다.")
	@ApiResponse(responseCode = "201", description = "페이지 복사 성공", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = PageResponse.class)))
	public ResponseEntity<PageResponse> copyPage(@PathVariable UUID pageId) {
		PageResponse response = pageService.copy(pageId);
		return ResponseEntity.created(URI.create("/api/v1/pages/" + response.page().pageId())).body(response);
	}

	@DeleteMapping("/pages/{pageId}")
	@Operation(summary = "페이지 삭제", description = "페이지를 휴지통 처리합니다. 없는 ID 및 재삭제는 404입니다.")
	@ApiResponse(responseCode = "204", description = "삭제 성공, 본문 없음", content = @Content)
	public ResponseEntity<Void> deletePage(@PathVariable UUID pageId) {
		pageService.delete(pageId);
		return ResponseEntity.noContent().build();
	}
}
