package com.f106.DIO.auth.login;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/auth")
@Tag(name = "일반 로그인", description = "이메일 로그인·토큰 재발급·현재 기기 로그아웃")
public class LoginController {
    private final EmailLoginService service;
    public LoginController(EmailLoginService service) { this.service = service; }
    @PostMapping("/login")
    @Operation(summary = "일반 로그인", description = "이메일·비밀번호로 로그인합니다. Access Token 15분, Refresh Token 세션 최대 30일(기본값). 15분 내 실패 횟수와 진행 중 검증을 합쳐 이메일/IP 조합 5회, IP 전체 100회에 도달하면 다음 요청은 429입니다. deviceName은 선택입니다.")
    public ResponseEntity<LoginDtos.Tokens> login(@Valid @RequestBody LoginDtos.LoginRequest request, HttpServletRequest http) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("Pragma", "no-cache")
            .body(service.login(request, http.getRemoteAddr()));
    }
    @PostMapping("/refresh")
    @Operation(summary = "로그인 토큰 재발급", description = "Authorization 없이 refreshToken을 전달합니다. 성공하면 새 Access/Refresh Token으로 모두 교체하세요. 이전 Refresh Token을 다시 사용하면 해당 기기 세션을 종료합니다. 최초 로그인 후 30일이 지나면 다시 로그인해야 합니다.")
    public ResponseEntity<LoginDtos.Tokens> refresh(@Valid @RequestBody LoginDtos.RefreshRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("Pragma", "no-cache")
            .body(service.refresh(request.refreshToken()));
    }
    @PostMapping("/logout")
    @ApiResponse(responseCode = "204", description = "현재 로그인 세션 로그아웃 완료. 응답 본문 없음", content = @Content)
    @Operation(summary = "현재 로그인 세션 로그아웃", description = "Bearer Access Token이 필요합니다. 현재 기기 세션의 Access/Refresh Token을 무효화합니다. 다른 기기 로그인은 유지합니다. 요청 본문은 없습니다.")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal Jwt jwt) {
        service.logout(jwt);
        return ResponseEntity.noContent().header("Cache-Control", "no-store").build();
    }
}
