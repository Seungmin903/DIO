package com.f106.DIO.diary.update;

import com.f106.DIO.diary.read.*;
import java.security.Principal;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.responses.*;

@RestController
@RequestMapping("/api/v1/diaries")
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name="bearerAuth")
public class AccountDiaryUpdateController {
    private final AccountDiaryUpdateService service;
    public AccountDiaryUpdateController(AccountDiaryUpdateService service) { this.service=service; }
    @PatchMapping("/{diaryId}")
    @Operation(summary="소유자의 다이어리 이름·표지 수정",description="expectedVersion은 현재 version과 동일한 양의 BIGINT 문자열. 성공마다 version이 1 증가합니다.")
    @ApiResponses({@ApiResponse(responseCode="200",description="수정된 다이어리"),
        @ApiResponse(responseCode="400",description="잘못된 ID, 버전 또는 수정 항목"),
        @ApiResponse(responseCode="401",description="인증 필요"),
        @ApiResponse(responseCode="403",description="DIARY_OWNER_REQUIRED"),
        @ApiResponse(responseCode="404",description="DIARY_NOT_FOUND: 없거나 접근 불가"),
        @ApiResponse(responseCode="409",description="VERSION_CONFLICT 또는 VERSION_EXHAUSTED")})
    public ResponseEntity<DiaryReadDtos.Detail> update(Principal principal,@PathVariable String diaryId,@Valid @RequestBody AccountDiaryUpdateRequest request) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(service.update(DiaryReadController.user(principal),diaryId,request));
    }
}
