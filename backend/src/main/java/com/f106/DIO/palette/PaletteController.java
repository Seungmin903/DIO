package com.f106.DIO.palette;

import java.util.List;
import java.util.Map;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/palettes")
@Tag(name = "꾸미기 공방")
@SecurityRequirement(name = "bearerAuth")
public class PaletteController {
    public record PaletteUpdate(Long expectedVersion, Map<String, List<String>> palettes) {}
    private final PaletteService service;
    public PaletteController(PaletteService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "내 팔레트", description = "꾸미기 공방 도구 탭 팔레트(도구별 고정 칸)를 돌려줍니다. 저장한 적이 없으면 version 0 과 빈 palettes 이며, 없는 도구는 앱 기본 색입니다.")
    public ResponseEntity<PaletteService.PaletteDocument> get(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.get(Long.parseLong(jwt.getSubject())));
    }

    @PutMapping
    @Operation(summary = "내 팔레트 저장", description = "팔레트 전체를 바꿉니다. expectedVersion 은 기기가 마지막으로 받은 version 이며 다르면 409(PALETTE_CONFLICT)입니다.")
    @ApiResponse(responseCode = "200", description = "저장한 팔레트(새 version)")
    @ApiResponse(responseCode = "400", description = "도구 이름 · 칸 수 · 색 형식 오류(INVALID_PALETTE)")
    @ApiResponse(responseCode = "409", description = "다른 기기에서 먼저 바꿈(PALETTE_CONFLICT)")
    public ResponseEntity<PaletteService.PaletteDocument> put(@AuthenticationPrincipal Jwt jwt, @RequestBody PaletteUpdate request) {
        if (request == null) throw PaletteException.invalid("팔레트 내용이 필요합니다.");
        return ResponseEntity.ok().header("Cache-Control", "no-store")
            .body(service.replace(Long.parseLong(jwt.getSubject()), request.expectedVersion(), request.palettes()));
    }
}
