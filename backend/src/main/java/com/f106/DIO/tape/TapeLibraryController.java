package com.f106.DIO.tape;

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
@RequestMapping("/api/v1/me/tape-library")
@Tag(name = "꾸미기 공방")
@SecurityRequirement(name = "bearerAuth")
public class TapeLibraryController {
    public record TapeLibraryUpdate(Long expectedVersion, List<TapeLibraryService.TapeFolder> folders) {}
    private final TapeLibraryService service;
    public TapeLibraryController(TapeLibraryService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "내 테이프 보관함", description = "꾸미기 공방 테이프 폴더 구성을 돌려줍니다. 저장한 적이 없으면 version 0 과 빈 폴더 목록입니다. 사진 테이프 이미지는 /api/v1/media/{mediaFileId}/file 로 받습니다.")
    public ResponseEntity<TapeLibraryService.TapeLibraryDocument> get(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.get(Long.parseLong(jwt.getSubject())));
    }

    @PutMapping
    @Operation(summary = "내 테이프 보관함 저장", description = "폴더 구성 전체를 바꿉니다. expectedVersion 은 기기가 마지막으로 받은 version 이며 다르면 409(TAPE_LIBRARY_CONFLICT)입니다. mediaFileId 는 내가 올린 이미지(/api/v1/media, TAPE)만 넣을 수 있습니다.")
    @ApiResponse(responseCode = "200", description = "저장한 보관함(새 version)")
    @ApiResponse(responseCode = "400", description = "폴더 · 테이프 형식 오류, 내 이미지가 아닌 mediaFileId(TAPE_MEDIA_NOT_FOUND)")
    @ApiResponse(responseCode = "409", description = "다른 기기에서 먼저 바꿈(TAPE_LIBRARY_CONFLICT)")
    public ResponseEntity<TapeLibraryService.TapeLibraryDocument> put(@AuthenticationPrincipal Jwt jwt, @RequestBody TapeLibraryUpdate request) {
        if (request == null) throw TapeLibraryException.invalid("보관함 내용이 필요합니다.");
        return ResponseEntity.ok().header("Cache-Control", "no-store")
            .body(service.replace(Long.parseLong(jwt.getSubject()), request.expectedVersion(), request.folders()));
    }
}
