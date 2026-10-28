package com.f106.DIO.diary.read;

import java.security.Principal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/diaries")
@SecurityRequirement(name = "bearerAuth")
public class DiaryReadController {
    private final DiaryReadService service;
    public DiaryReadController(DiaryReadService service) { this.service = service; }
    @GetMapping
    @Operation(summary = "내 다이어리 목록", description = "활성 소유자·편집자 범위에서 조회. 휴지통은 소유자만 조회합니다.")
    public ResponseEntity<DiaryReadDtos.Page> list(Principal principal,
        @RequestParam(defaultValue="active") String status, @RequestParam(defaultValue="all") String filter,
        @RequestParam(defaultValue="") String q, @RequestParam(defaultValue="updatedAtDesc") String sort,
        @RequestParam(defaultValue="false") boolean favorite, @RequestParam(defaultValue="20") int limit,
        @RequestParam(required=false) String cursor) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.list(user(principal), status, filter, q, sort, favorite, limit, cursor));
    }
    @GetMapping("/{diaryId}")
    @Operation(summary = "내 다이어리 상세", description = "비참여·강퇴·탈퇴·삭제된 다이어리는 404입니다.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="200", description="접근 가능한 다이어리")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="404", description="다이어리 없음 또는 접근 불가")
    public ResponseEntity<DiaryReadDtos.Detail> detail(Principal principal, @PathVariable String diaryId) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.detail(user(principal), diaryId));
    }
    public static long user(Principal principal) {
        if (principal instanceof JwtAuthenticationToken token && token.isAuthenticated()) {
            try { long id = Long.parseLong(token.getToken().getSubject()); if (id > 0) return id; }
            catch (NumberFormatException ignored) { }
        }
        throw new DiaryReadException(401, "AUTHENTICATION_REQUIRED", "다시 로그인해 주세요.");
    }
}
