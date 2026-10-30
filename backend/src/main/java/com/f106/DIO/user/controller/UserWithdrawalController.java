package com.f106.DIO.user.controller;
import com.f106.DIO.user.service.UserWithdrawalService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
@RestController @RequestMapping("/api/v1/me") @Tag(name="회원") @SecurityRequirement(name="bearerAuth")
public class UserWithdrawalController {
    private final UserWithdrawalService service;
    public UserWithdrawalController(UserWithdrawalService service){this.service=service;}
    @DeleteMapping
    @Operation(summary="회원 탈퇴",description="다른 멤버가 있는 소유 다이어리는 먼저 양도해야 합니다(409). 개인 다이어리는 영구 삭제하고 다른 소유자의 공유 작업은 보존합니다. 모든 세션을 폐기합니다. 성공 204, 요청·응답 본문 없음.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204",description="탈퇴 완료",content=@io.swagger.v3.oas.annotations.media.Content)
    public ResponseEntity<Void> withdraw(@AuthenticationPrincipal Jwt jwt){
        service.withdraw(Long.parseLong(jwt.getSubject()));
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
}
