package com.f106.DIO.font;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/handwriting-fonts/share-consent")
@Tag(name = "폰트")
@SecurityRequirement(name = "bearerAuth")
public class FontShareConsentController {
    public record Update(
        @NotNull @Schema(example = "true", description = "공유 다이어리에 내 손글씨 폰트를 올려 공유할지") Boolean agreed,
        @Schema(example = "false", description = "true 면 아직 답이 없을 때만 저장한다(기기에만 있던 예전 답 옮기기). 이미 답이 있으면 저장하지 않고 그 값을 돌려준다") Boolean onlyIfNotAsked) {}

    private final FontShareConsentService service;
    public FontShareConsentController(FontShareConsentService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "내 폰트 공유 동의 조회", description = "계정 단위 값입니다. status 는 GRANTED · DENIED · NOT_ASKED(아직 묻지 않음, changedAt=null)입니다.")
    @ApiResponse(responseCode = "200", description = "현재 동의 상태")
    @ApiResponse(responseCode = "401", description = "로그인 필요 · 만료 · 비활성 회원")
    public ResponseEntity<FontShareConsentService.Consent> get(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.get(Long.parseLong(jwt.getSubject())));
    }

    @PutMapping
    @Operation(summary = "내 폰트 공유 동의 저장", description = "모든 기기가 같은 값을 씁니다. 같은 값을 다시 보내면 changedAt 을 바꾸지 않습니다.")
    @ApiResponse(responseCode = "200", description = "저장된(또는 onlyIfNotAsked 로 유지된) 동의 상태")
    @ApiResponse(responseCode = "400", description = "agreed 없음")
    @ApiResponse(responseCode = "401", description = "로그인 필요 · 만료 · 비활성 회원")
    public ResponseEntity<FontShareConsentService.Consent> put(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Update request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.set(Long.parseLong(jwt.getSubject()),
            request.agreed(), Boolean.TRUE.equals(request.onlyIfNotAsked())));
    }
}
