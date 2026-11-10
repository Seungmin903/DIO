package com.f106.DIO.paper;

import java.util.List;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/paper-library")
@Tag(name = "꾸미기 공방")
@SecurityRequirement(name = "bearerAuth")
public class PaperLibraryController {
    public record PaperLibraryUpdate(Long expectedVersion, List<PaperLibraryService.PaperEntry> papers, PaperLibraryService.PaperStyle style) {}
    private final PaperLibraryService service;
    public PaperLibraryController(PaperLibraryService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "내 속지 보관함", description = "꾸미기 공방 내 속지 목록과 기본 속지 스타일을 돌려줍니다. 저장한 적이 없으면 version 0, 빈 목록, style null 입니다. 쪽 그림은 /api/v1/media/{mediaFileId}/file 로 받습니다.")
    public ResponseEntity<PaperLibraryService.PaperLibraryDocument> get(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.get(Long.parseLong(jwt.getSubject())));
    }

    @PutMapping
    @Operation(summary = "내 속지 보관함 저장", description = "속지 목록과 기본 속지 스타일 전체를 바꿉니다. expectedVersion 은 기기가 마지막으로 받은 version 이며 다르면 409(PAPER_LIBRARY_CONFLICT)입니다. 쪽의 mediaFileId 는 내가 올린 이미지(/api/v1/media)만 넣을 수 있습니다.")
    @ApiResponse(responseCode = "200", description = "저장한 보관함(새 version)")
    @ApiResponse(responseCode = "400", description = "속지 형식 오류(INVALID_PAPER_LIBRARY), 내 이미지가 아닌 mediaFileId(PAPER_MEDIA_NOT_FOUND)")
    @ApiResponse(responseCode = "409", description = "다른 기기에서 먼저 바꿈(PAPER_LIBRARY_CONFLICT)")
    public ResponseEntity<PaperLibraryService.PaperLibraryDocument> put(@AuthenticationPrincipal Jwt jwt, @RequestBody PaperLibraryUpdate request) {
        if (request == null) throw PaperLibraryException.invalid("보관함 내용이 필요합니다.");
        return ResponseEntity.ok().header("Cache-Control", "no-store")
            .body(service.replace(Long.parseLong(jwt.getSubject()), request.expectedVersion(), request.papers(), request.style()));
    }
}
