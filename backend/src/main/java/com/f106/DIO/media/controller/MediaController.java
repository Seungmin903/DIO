package com.f106.DIO.media.controller;

import java.util.UUID;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import com.f106.DIO.media.dto.MediaFileListResponse;
import com.f106.DIO.media.dto.MediaFileResponse;
import com.f106.DIO.media.service.MediaService;

@RestController @RequestMapping("/api/v1/media") @Tag(name = "미디어", description = "사용자 미디어 보관함 API") @SecurityRequirement(name = "bearerAuth")
public class MediaController {
	private final MediaService mediaService;
	public MediaController(MediaService mediaService) { this.mediaService = mediaService; }
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@Operation(summary = "미디어 업로드", description = "이미지(JPEG, PNG, WebP, GIF) 또는 오디오(MP3, M4A, WAV, OGG)를 업로드합니다. 파일 형식은 서버가 판별합니다.")
	public ResponseEntity<MediaFileResponse> upload(@RequestPart("file") MultipartFile file,
			@Parameter(description = "이미지는 PHOTO·STICKER·TAPE, 오디오는 AUDIO. 생략 시 파일 유형의 기본값") @RequestParam(required = false) String libraryCategory,
			@AuthenticationPrincipal Jwt jwt) {
		MediaFileResponse response = mediaService.upload(file, libraryCategory, userId(jwt));
		return ResponseEntity.created(java.net.URI.create("/api/v1/media/" + response.mediaFileId())).body(response);
	}
	@GetMapping
	@Operation(summary = "미디어 보관함 목록", description = "로그인 사용자가 소유한 삭제되지 않은 미디어를 최신순으로 조회합니다.")
	public MediaFileListResponse list(@RequestParam(defaultValue = "30") int limit, @RequestParam(required = false) String cursor,
			@AuthenticationPrincipal Jwt jwt) { return mediaService.list(userId(jwt), limit, cursor); }
	@GetMapping("/{mediaFileId}")
	@Operation(summary = "미디어 메타데이터 조회")
	public MediaFileResponse detail(@PathVariable UUID mediaFileId, @AuthenticationPrincipal Jwt jwt) {
		return mediaService.detail(mediaFileId, userId(jwt));
	}
	@GetMapping("/{mediaFileId}/file")
	@Operation(summary = "미디어 파일 조회", description = "소유자만 원본 파일 바이트를 조회합니다.")
	public ResponseEntity<byte[]> file(@PathVariable UUID mediaFileId, @AuthenticationPrincipal Jwt jwt) {
		MediaService.DownloadedMedia file = mediaService.file(mediaFileId, userId(jwt));
		return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.mimeType())).header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(file.content());
	}
	@DeleteMapping("/{mediaFileId}") @Operation(summary = "미디어 삭제", description = "로그인 사용자가 소유한 미디어를 소프트 삭제합니다.")
	public ResponseEntity<Void> delete(@PathVariable UUID mediaFileId, @AuthenticationPrincipal Jwt jwt) { mediaService.delete(mediaFileId, userId(jwt)); return ResponseEntity.noContent().build(); }
	private static Long userId(Jwt jwt) { return Long.valueOf(jwt.getSubject()); }
}
