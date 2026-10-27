package com.f106.DIO.page.controller;

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

import com.f106.DIO.page.dto.CanvasElementBatchRequest;
import com.f106.DIO.page.dto.CanvasElementListResponse;
import com.f106.DIO.page.dto.CanvasElementResponse;
import com.f106.DIO.page.dto.CanvasElementUpdateRequest;
import com.f106.DIO.page.service.CanvasElementService;

@RestController
@RequestMapping("/api/v1/pages/{pageId}/elements")
@Tag(name = "캔버스 요소", description = "페이지 위 텍스트·사진·스티커·테이프·필기 요소 API. 조회는 페이지 상세 조회를 사용합니다.")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "잘못된 요청 또는 ID", content = @Content(
		mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class))),
	@ApiResponse(responseCode = "404", description = "페이지 또는 요소 없음", content = @Content(
		mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class))),
	@ApiResponse(responseCode = "409", description = "버전·ID 충돌 또는 복구할 수 없는 상태", content = @Content(
		mediaType = "application/problem+json", schema = @Schema(implementation = ProblemDetail.class)))
})
public class CanvasElementController {

	private final CanvasElementService elementService;

	public CanvasElementController(CanvasElementService elementService) {
		this.elementService = elementService;
	}

	@PostMapping("/batch")
	@Operation(summary = "캔버스 요소 일괄 변경", description = "creates·updates·deleteElementIds·restoreElementIds를 한 트랜잭션으로 적용합니다. "
		+ "하나라도 실패하면 전체가 취소되고, 성공하면 페이지의 현재 요소 목록을 반환합니다.")
	@ApiResponse(responseCode = "200", description = "일괄 변경 성공", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = CanvasElementListResponse.class)))
	public CanvasElementListResponse batchElements(@PathVariable UUID pageId, @Valid @RequestBody CanvasElementBatchRequest request) {
		return elementService.batch(pageId, request);
	}

	@PatchMapping("/{elementId}")
	@Operation(summary = "캔버스 요소 수정", description = "위치·크기·레이어 순서·속성 등 하나 이상 전달합니다. 생략한 필드는 유지합니다.")
	@ApiResponse(responseCode = "200", description = "요소 수정 성공", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = CanvasElementResponse.class)))
	public CanvasElementResponse updateElement(@PathVariable UUID pageId, @PathVariable UUID elementId,
		@Valid @RequestBody CanvasElementUpdateRequest request) {
		return elementService.update(pageId, elementId, request);
	}

	@DeleteMapping("/{elementId}")
	@Operation(summary = "캔버스 요소 삭제", description = "요소를 휴지통 처리합니다. 복구 API로 되돌릴 수 있습니다.")
	@ApiResponse(responseCode = "204", description = "삭제 성공, 본문 없음", content = @Content)
	public ResponseEntity<Void> deleteElement(@PathVariable UUID pageId, @PathVariable UUID elementId) {
		elementService.delete(pageId, elementId);
		return ResponseEntity.noContent().build();
	}

	@PostMapping("/{elementId}/restore")
	@Operation(summary = "캔버스 요소 복구", description = "삭제된 요소를 되살립니다. 삭제되지 않은 요소는 409입니다.")
	@ApiResponse(responseCode = "200", description = "복구 성공", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = CanvasElementResponse.class)))
	public CanvasElementResponse restoreElement(@PathVariable UUID pageId, @PathVariable UUID elementId) {
		return elementService.restore(pageId, elementId);
	}
}
