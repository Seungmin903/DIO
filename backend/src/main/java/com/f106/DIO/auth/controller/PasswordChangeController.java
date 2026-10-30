package com.f106.DIO.auth.controller;

import com.f106.DIO.auth.dto.PasswordChangeRequest;
import com.f106.DIO.auth.service.PasswordChangeService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

@RestController
@RequestMapping("/api/v1/me/password")
@SecurityRequirement(name="bearerAuth")
public class PasswordChangeController {
    private final PasswordChangeService service;
    public PasswordChangeController(PasswordChangeService service){this.service=service;}
    @PatchMapping
    @Operation(summary="로그인한 이메일 회원의 비밀번호 변경",description="현재 비밀번호 확인 후 변경합니다. 성공하면 모든 기기 세션과 진행 중인 재설정 인증을 폐기하며 다시 로그인해야 합니다.")
    @ApiResponse(responseCode="204",description="변경 완료. 응답 본문 없음",content=@io.swagger.v3.oas.annotations.media.Content)
    public ResponseEntity<Void> change(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody PasswordChangeRequest request,HttpServletRequest http){
        service.change(jwt,request,http.getRemoteAddr());
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
}
