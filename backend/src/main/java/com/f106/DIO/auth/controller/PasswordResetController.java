package com.f106.DIO.auth.controller;

import static com.f106.DIO.auth.domain.PasswordResetPolicy.*;

import com.f106.DIO.auth.dto.PasswordResetRequest;
import com.f106.DIO.auth.dto.PasswordResetSentResponse;
import com.f106.DIO.auth.dto.PasswordResetVerificationRequest;
import com.f106.DIO.auth.dto.PasswordResetVerificationResponse;
import com.f106.DIO.auth.service.PasswordResetService;
import com.f106.DIO.auth.support.PasswordResetThrottle;
import com.f106.DIO.auth.dto.PasswordResetEmailRequest;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/auth")
@Tag(name = "비밀번호 재설정", description = "로그인하지 않은 사용자의 이메일 인증 기반 비밀번호 재설정")
public class PasswordResetController {
    private final PasswordResetService service;
    private final PasswordResetThrottle throttle;
    public PasswordResetController(PasswordResetService service, PasswordResetThrottle throttle) { this.service = service; this.throttle = throttle; }
    @PostMapping("/password-reset-requests")
    @Operation(summary = "비밀번호 재설정 인증번호 발송", description = "등록 여부·소셜 전용·비활성 여부와 무관하게 같은 202 상태·본문을 반환하지만 DB 처리 시간은 다를 수 있습니다. 유효한 인증번호·resetToken은 재발송으로 교체하지 않습니다. 인증번호 " + CODE_TTL_SECONDS + "초, resendAfter는 최소 요청 간격 " + RESEND_COOLDOWN_SECONDS + "초입니다. 발송 실패가 기록되면 쿨다운 후 재발급합니다. IP당 발송 요청은 " + IP_WINDOW_SECONDS + "초에 " + MAX_SEND_REQUESTS + "회입니다.")
    @ApiResponse(responseCode = "202", description = "요청 접수. 실제 이메일 발송 성공 또는 계정 존재를 뜻하지 않음")
    public ResponseEntity<PasswordResetSentResponse> send(@Valid @RequestBody PasswordResetEmailRequest request, HttpServletRequest http) {
        throttle.check("send", request.email(), http.getRemoteAddr());
        return ResponseEntity.accepted().header("Cache-Control", "no-store").body(service.send(request.email()));
    }
    @PostMapping("/password-reset-verifications")
    @Operation(summary = "비밀번호 재설정 인증번호 확인", description = "성공 시 " + TOKEN_TTL_SECONDS + "초 동안 유효한 일회용 resetToken을 발급합니다. 회원가입 signupToken과 별개이며 인증번호 오답 " + MAX_FAILED_ATTEMPTS + "회 이후 새 발송이 필요합니다.")
    public ResponseEntity<PasswordResetVerificationResponse> verify(@Valid @RequestBody PasswordResetVerificationRequest request, HttpServletRequest http) {
        throttle.check("verify", request.email(), http.getRemoteAddr());
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.verify(request));
    }
    @PostMapping("/password-resets")
    @Operation(summary = "비밀번호 재설정 완료", description = "이메일·resetToken·newPassword를 전달합니다. 비밀번호는 영문과 숫자를 포함한 ASCII 8~32자입니다. 성공 시 해당 회원의 모든 기기 세션을 폐기하며 다시 로그인해야 합니다.")
    @ApiResponse(responseCode = "204", description = "비밀번호 변경·기존 세션 폐기 완료. 응답 본문 없음", content = @Content)
    public ResponseEntity<Void> complete(@Valid @RequestBody PasswordResetRequest request, HttpServletRequest http) {
        throttle.check("reset", request.email(), http.getRemoteAddr());
        service.complete(request);
        return ResponseEntity.noContent().header("Cache-Control", "no-store").build();
    }
}
