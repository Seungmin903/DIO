package com.ssafy.dio.diary.controller;

import java.net.URI;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.ssafy.dio.diary.dto.DiaryCreateRequest;
import com.ssafy.dio.diary.dto.DiaryCreateResponse;
import com.ssafy.dio.diary.service.DiaryService;

@RestController
@RequestMapping("/api/v1/diaries")
@Tag(name = "다이어리", description = "비회원 다이어리 API")
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
	@Operation(summary = "다이어리 생성", description = "이름·표지·규격·기본 서식을 입력합니다. 첫 페이지 생성과 인증은 포함하지 않습니다.")
	@ApiResponse(responseCode = "201", description = "다이어리 생성 및 저장 성공 (local 프로필)", content = @Content(
		mediaType = "application/json", schema = @Schema(implementation = DiaryCreateResponse.class)))
	public ResponseEntity<DiaryCreateResponse> createDiary(@Valid @RequestBody DiaryCreateRequest request) {
		DiaryCreateResponse response = diaryService.createDiary(request);
		return ResponseEntity.created(URI.create("/api/v1/diaries/" + response.diary().diaryId())).body(response);
	}
}
