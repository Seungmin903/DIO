package com.f106.DIO.diary.controller;

import java.net.URI;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.dto.DiaryCreateResponse;
import com.f106.DIO.diary.dto.DiaryListResponse;
import com.f106.DIO.diary.dto.DiaryResponse;
import com.f106.DIO.diary.dto.DiaryUpdateRequest;
import com.f106.DIO.diary.service.DiaryService;

@RestController
@RequestMapping("/api/v1/diaries")
@Tag(name = "다이어리", description = "다이어리 메타데이터 API. 페이지와 속지는 별도 API에서 관리합니다.")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "잘못된 요청 또는 ID", content = @Content(
		mediaType = "application/problem+json", schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
})
public class DiaryController {

	private final DiaryService diaryService;

	public DiaryController(DiaryService diaryService) {
		this.diaryService = diaryService;
	}

	@PostMapping
	@Operation(summary = "다이어리 생성", description = "이름·표지·공개 범위를 입력합니다. 첫 페이지와 속지는 별도 API에서 생성합니다.")
	@ApiResponse(responseCode = "201", description = "다이어리 생성 및 저장 성공 (local 프로필)", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = DiaryCreateResponse.class)))
	public ResponseEntity<DiaryCreateResponse> createDiary(@Valid @RequestBody DiaryCreateRequest request) {
		DiaryCreateResponse response = diaryService.createDiary(request);
		return ResponseEntity.created(URI.create("/api/v1/diaries/" + response.diary().diaryId())).body(response);
	}

	@GetMapping
	@Operation(summary = "다이어리 목록 조회", description = "삭제되지 않은 다이어리를 생성 시각 내림차순으로 조회합니다.")
	@ApiResponse(responseCode = "200", description = "다이어리 목록 조회 성공 (local 프로필)", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = DiaryListResponse.class)))
	public DiaryListResponse getDiaries() {
		return diaryService.getDiaries();
	}

	@GetMapping("/{diaryId}")
	@Operation(summary = "다이어리 상세 조회", description = "UUID에 해당하는 저장된 다이어리를 조회합니다.")
	@ApiResponse(responseCode = "200", description = "다이어리 상세 조회 성공 (local 프로필)", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = DiaryResponse.class)))
	@ApiResponse(responseCode = "404", description = "다이어리 없음", content = @Content(
		mediaType = "application/problem+json", schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
	public DiaryResponse getDiary(@PathVariable java.util.UUID diaryId) {
		return diaryService.getDiary(diaryId);
	}

	@PatchMapping("/{diaryId}")
	@Operation(summary = "다이어리 수정", description = "이름·표지색·표지 스타일·공개 범위 중 하나 이상 전달합니다.")
	@ApiResponse(responseCode = "200", description = "다이어리 수정 및 저장 성공 (local 프로필)", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = DiaryResponse.class)))
	@ApiResponse(responseCode = "404", description = "다이어리 없음", content = @Content(
		mediaType = "application/problem+json", schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
	public DiaryResponse updateDiary(@PathVariable java.util.UUID diaryId,
		@Valid @RequestBody DiaryUpdateRequest request) {
		return diaryService.updateDiary(diaryId, request);
	}

	@DeleteMapping("/{diaryId}")
	@Operation(summary = "다이어리 삭제", description = "해당 다이어리를 휴지통 처리합니다. 없는 ID 및 재삭제는 404입니다.")
	@ApiResponse(responseCode = "204", description = "삭제 성공, 본문 없음", content = @Content)
	@ApiResponse(responseCode = "404", description = "다이어리 없음", content = @Content(
		mediaType = "application/problem+json", schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
	public ResponseEntity<Void> deleteDiary(@PathVariable java.util.UUID diaryId) {
		diaryService.deleteDiary(diaryId);
		return ResponseEntity.noContent().build();
	}
}
