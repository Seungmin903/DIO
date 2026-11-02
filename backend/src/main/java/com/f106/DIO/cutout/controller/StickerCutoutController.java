package com.f106.DIO.cutout.controller;

import java.util.UUID;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import com.f106.DIO.cutout.dto.CutoutCreatedResponse;
import com.f106.DIO.cutout.dto.CutoutPreviewResponse;
import com.f106.DIO.cutout.dto.CutoutSelectionRequest;
import com.f106.DIO.cutout.service.StickerCutoutService;
import com.f106.DIO.media.dto.MediaFileResponse;

@RestController @RequestMapping("/api/v1/sticker-cutouts") @Tag(name = "사진 속 대상 오리기", description = "SAM 2로 사진 속 대상을 골라 스티커로 만드는 API (로그인 사용자 전용)") @SecurityRequirement(name = "bearerAuth")
public class StickerCutoutController {
	private final StickerCutoutService service;
	public StickerCutoutController(StickerCutoutService service) { this.service = service; }

	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@Operation(summary = "사진 올리기", description = "JPG·PNG·WebP, 20MB·4천만 화소 이하. 사진을 분석해 두고 cutoutId 를 돌려줍니다. 사진 원본은 저장하지 않습니다.")
	public ResponseEntity<CutoutCreatedResponse> open(@RequestPart("file") MultipartFile file, @AuthenticationPrincipal Jwt jwt) {
		return ResponseEntity.status(201).header(HttpHeaders.CACHE_CONTROL, "no-store").body(service.open(file, userId(jwt)));
	}

	@PostMapping(path = "/{cutoutId}/segment", consumes = MediaType.APPLICATION_JSON_VALUE)
	@Operation(summary = "붓질 미리보기", description = "points(탭) 또는 strokes(붓) 중 하나를 보냅니다. 원본 위에 겹칠 선택 영역 PNG 를 돌려줍니다.")
	public ResponseEntity<CutoutPreviewResponse> segment(@PathVariable UUID cutoutId, @Valid @RequestBody CutoutSelectionRequest selection, @AuthenticationPrincipal Jwt jwt) {
		return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(service.segment(cutoutId, selection, userId(jwt)));
	}

	@PostMapping(path = "/{cutoutId}/render", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.IMAGE_PNG_VALUE)
	@Operation(summary = "결과 스티커 보기", description = "흰 테두리 스티커 PNG 를 돌려줍니다. 저장하지 않습니다.")
	public ResponseEntity<byte[]> render(@PathVariable UUID cutoutId, @Valid @RequestBody CutoutSelectionRequest selection, @AuthenticationPrincipal Jwt jwt) {
		return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).header(HttpHeaders.CACHE_CONTROL, "private, no-store")
			.body(service.render(cutoutId, selection, userId(jwt)));
	}

	@PostMapping(path = "/{cutoutId}/save", consumes = MediaType.APPLICATION_JSON_VALUE)
	@Operation(summary = "스티커로 저장", description = "같은 선택으로 서버가 스티커를 다시 만들어 내 보관함(STICKER, AI_RESULT)에 저장합니다.")
	public ResponseEntity<MediaFileResponse> save(@PathVariable UUID cutoutId, @Valid @RequestBody CutoutSelectionRequest selection, @AuthenticationPrincipal Jwt jwt) {
		MediaFileResponse saved = service.save(cutoutId, selection, userId(jwt));
		return ResponseEntity.created(java.net.URI.create("/api/v1/media/" + saved.mediaFileId())).body(saved);
	}

	@DeleteMapping("/{cutoutId}")
	@Operation(summary = "오리기 닫기", description = "화면을 닫을 때 호출합니다. 호출하지 않아도 마지막 사용 후 30분이 지나면 사라집니다.")
	public ResponseEntity<Void> close(@PathVariable UUID cutoutId, @AuthenticationPrincipal Jwt jwt) {
		service.close(cutoutId, userId(jwt));
		return ResponseEntity.noContent().build();
	}

	private static Long userId(Jwt jwt) { return Long.valueOf(jwt.getSubject()); }
}
