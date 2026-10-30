package com.f106.DIO.font;

import java.util.List;
import java.util.UUID;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@Tag(name="폰트")
@SecurityRequirement(name="bearerAuth")
public class FontController {
    private final FontService service;
    private final FontDownloadAdmission admission;
    public FontController(FontService service, FontDownloadAdmission admission) { this.service=service; this.admission=admission; }
    public record Share(@NotNull UUID mediaFileId) {}
    public record State(@NotNull Boolean enabled) {}
    @GetMapping("/diaries/{diaryId}/fonts/{mediaFileId}/file")
    @Operation(summary="다이어리 공유 폰트 다운로드", description="활성 OWNER·EDITOR만 enabled·FONT·READY·미삭제 공유 파일을 조회합니다.")
    public ResponseEntity<byte[]> file(@PathVariable UUID diaryId,@PathVariable UUID mediaFileId) {
        var permit=admission.tryAcquire();
        if (permit == null) return ResponseEntity.status(503).header("Retry-After", "1").header("Cache-Control", "no-store").build();
        try (permit) {
            var file=service.download(diaryId,mediaFileId);
            return ResponseEntity.ok().header("Cache-Control","private, no-store").header("X-Content-Type-Options","nosniff")
                .contentType(org.springframework.http.MediaType.parseMediaType(file.mimeType())).body(file.content());
        }
    }
    @GetMapping("/handwriting-fonts") @Operation(summary="내 손글씨 폰트 목록")
    public ResponseEntity<List<FontService.Font>> mine() { return ResponseEntity.ok().header("Cache-Control","no-store").body(service.mine()); }
    @GetMapping("/diaries/{diaryId}/fonts") @Operation(summary="다이어리 폰트 목록")
    public ResponseEntity<List<FontService.Font>> list(@PathVariable UUID diaryId) { return ResponseEntity.ok().header("Cache-Control","no-store").body(service.list(diaryId)); }
    @PostMapping("/diaries/{diaryId}/fonts") @Operation(summary="다이어리에 폰트 공유")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204", description="공유 완료 또는 기존 공유 유지")
    public ResponseEntity<Void> share(@PathVariable UUID diaryId,@Valid @RequestBody Share request) { service.share(diaryId,request.mediaFileId()); return ResponseEntity.noContent().build(); }
    @PatchMapping("/diaries/{diaryId}/fonts/{mediaFileId}") @Operation(summary="폰트 사용 상태 변경")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204", description="사용 상태 변경 완료")
    public ResponseEntity<Void> enabled(@PathVariable UUID diaryId,@PathVariable UUID mediaFileId,@Valid @RequestBody State request) { service.setEnabled(diaryId,mediaFileId,request.enabled()); return ResponseEntity.noContent().build(); }
}
