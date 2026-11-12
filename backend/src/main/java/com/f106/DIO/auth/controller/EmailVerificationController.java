package com.f106.DIO.auth.controller;

import static com.f106.DIO.auth.domain.SignupVerificationPolicy.*;

import com.f106.DIO.auth.dto.EmailVerificationRequest;
import com.f106.DIO.auth.dto.EmailVerificationResponse;
import com.f106.DIO.auth.dto.EmailVerificationSentResponse;
import com.f106.DIO.user.dto.EmailRequest;

import com.f106.DIO.auth.service.EmailVerificationService;
import com.f106.DIO.auth.support.SignupMailThrottle;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/auth")
@Tag(name = "일반 회원가입", description = "이메일 인증번호 발송·확인")
public class EmailVerificationController {
    private final EmailVerificationService verification;
    private final SignupMailThrottle mailThrottle;
    public EmailVerificationController(EmailVerificationService verification, SignupMailThrottle mailThrottle) {
        this.verification = verification; this.mailThrottle = mailThrottle;
    }
    @PostMapping("/email-verifications")
    @Operation(summary = "회원가입 인증번호 발송", description = "6자리 번호, 유효기간 600초, 이메일별 재발송 간격 60초. 같은 IP의 발송 요청은 이메일 주소와 무관하게 15분 동안 최대 20회입니다. 제한 시 Retry-After(초)를 확인하세요. SMTP와 비밀키 설정 필요. 번호는 응답하지 않습니다.")
    @ApiResponse(responseCode = "200", description = "인증 메일 발송 완료")
    @ApiResponse(responseCode = "429", description = "재발송 제한")
    @ApiResponse(responseCode = "503", description = "이메일 인증 설정 또는 발송 실패")
    public ResponseEntity<EmailVerificationSentResponse> send(@Valid @RequestBody EmailRequest request,
            jakarta.servlet.http.HttpServletRequest http) {
        mailThrottle.check(http.getRemoteAddr());
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(verification.send(request.email()));
    }
    @PostMapping("/email-verifications/verify")
    @Operation(summary = "회원가입 인증번호 확인", description = "오답 최대 5회. 성공 시 인증 완료 시점부터 " + SIGNUP_TOKEN_TTL_SECONDS + "초(1시간) 유효한 일회용 signupToken을 발급합니다. 번호 재사용은 불가합니다.")
    @ApiResponse(responseCode = "200", description = "인증 성공 및 가입 토큰 발급")
    @ApiResponse(responseCode = "400", description = "잘못되거나 만료된 인증번호")
    @ApiResponse(responseCode = "429", description = "오답 횟수 초과")
    public ResponseEntity<EmailVerificationResponse> verify(@Valid @RequestBody EmailVerificationRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(verification.verify(request));
    }
}
