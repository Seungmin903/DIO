package com.f106.DIO.media.library.controller;

import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.f106.DIO.media.library.dto.SharedMediaLibraryAddRequest;
import com.f106.DIO.media.library.dto.SharedMediaLibraryItemResponse;
import com.f106.DIO.media.library.dto.SharedMediaLibraryListResponse;
import com.f106.DIO.media.library.service.SharedMediaLibraryService;

@RestController
@RequestMapping("/api/v1/diaries/{diaryId}/media-library")
@Tag(name = "공유 보관함", description = "다이어리 참여자가 함께 사용하는 스티커·테이프 보관함 API")
@SecurityRequirement(name = "bearerAuth")
public class SharedMediaLibraryController {
	private final SharedMediaLibraryService library;
	public SharedMediaLibraryController(SharedMediaLibraryService library) { this.library = library; }

	@PostMapping
	@Operation(summary = "공유 보관함 추가", description = "로그인한 OWNER 또는 EDITOR가 본인 미디어의 스티커·테이프를 공유 보관함에 추가합니다.")
	@ApiResponse(responseCode = "201", description = "추가 성공")
	public ResponseEntity<SharedMediaLibraryItemResponse> add(@PathVariable UUID diaryId,
			@Valid @RequestBody SharedMediaLibraryAddRequest request, @AuthenticationPrincipal Jwt jwt) {
		SharedMediaLibraryItemResponse response = library.add(diaryId, request.mediaFileId(), userId(jwt));
		// 공유 항목 단건 조회 API가 없으므로 따라갈 수 없는 Location은 보내지 않는다.
		return ResponseEntity.status(HttpStatus.CREATED).body(response);
	}

	@GetMapping
	@Operation(summary = "다이어리 공유 보관함 조회", description = "로그인한 다이어리 참여자가 공유 보관함을 최신 추가순으로 조회합니다.")
	public SharedMediaLibraryListResponse list(@PathVariable UUID diaryId, @AuthenticationPrincipal Jwt jwt) {
		return library.list(diaryId, userId(jwt));
	}

	@DeleteMapping("/{mediaFileId}")
	@Operation(summary = "공유 보관함 삭제", description = "로그인한 OWNER 또는 EDITOR가 공유 보관함에서만 미디어 연결을 제거합니다. 미디어 원본 소유자는 다이어리 권한과 관계없이 자기 미디어의 연결을 제거할 수 있습니다. 원본 미디어는 삭제하지 않습니다.")
	@ApiResponse(responseCode = "204", description = "삭제 성공")
	public ResponseEntity<Void> delete(@PathVariable UUID diaryId, @PathVariable UUID mediaFileId, @AuthenticationPrincipal Jwt jwt) {
		library.delete(diaryId, mediaFileId, userId(jwt));
		return ResponseEntity.noContent().build();
	}

	private static Long userId(Jwt jwt) { return Long.valueOf(jwt.getSubject()); }
}
