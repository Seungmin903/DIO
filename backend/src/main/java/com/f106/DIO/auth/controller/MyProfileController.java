package com.f106.DIO.auth.controller;

import com.f106.DIO.auth.dto.LoginUserResponse;
import com.f106.DIO.auth.dto.WithdrawalRequest;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.service.AppleWithdrawalRevocation;
import com.f106.DIO.auth.service.MyProfileService;
import com.f106.DIO.user.dto.ProfileUpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/me")
@SecurityRequirement(name = "bearerAuth")
public class MyProfileController {
    private final MyProfileService profiles;
    private final AppleWithdrawalRevocation apple;

    public MyProfileController(MyProfileService profiles, AppleWithdrawalRevocation apple) {
        this.profiles = profiles;
        this.apple = apple;
    }

    @GetMapping
    @Operation(summary = "내 회원정보 조회")
    public ResponseEntity<LoginUserResponse> profile(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(profiles.profile(userId(jwt)));
    }

    @PatchMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "내 회원정보 수정", description = "닉네임을 수정하거나 removeProfilePhoto를 true로 보내 기본 프로필 이미지로 되돌립니다.")
    @ApiResponse(responseCode = "200", description = "수정된 회원정보")
    public ResponseEntity<LoginUserResponse> update(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ProfileUpdateRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(profiles.update(userId(jwt), request, null));
    }

    @PatchMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "내 회원정보와 프로필 사진 수정", description = "profile JSON 파트와 photo JPEG/PNG 파일을 보냅니다. 사진은 최대 5MB이며 서버에서 PNG로 변환해 저장합니다.")
    public ResponseEntity<LoginUserResponse> updateWithPhoto(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestPart("profile") ProfileUpdateRequest request,
            @RequestPart(value = "photo", required = false) MultipartFile photo) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(profiles.update(userId(jwt), request, photo));
    }

    @DeleteMapping
    @Operation(summary = "회원 탈퇴", description = "로그인한 계정을 탈퇴 처리하고 모든 로그인 세션을 폐기합니다. "
        + "애플 회원은 앱에서 애플 로그인을 다시 받아 {\"appleAuthorizationCode\": \"...\"}를 보내야 하며, 서버가 Apple 토큰을 철회한 뒤 탈퇴합니다. "
        + "다른 회원은 본문 없이 보냅니다.")
    @ApiResponse(responseCode = "204", description = "회원 탈퇴 완료")
    @ApiResponse(responseCode = "400", description = "APPLE_REAUTH_REQUIRED(애플 재확인 필요) 또는 INVALID_APPLE_AUTHORIZATION(만료·재사용된 code)")
    @ApiResponse(responseCode = "403", description = "APPLE_ACCOUNT_MISMATCH: 다른 애플 ID로 확인함")
    @ApiResponse(responseCode = "409", description = "다른 멤버가 있는 소유 다이어리의 소유권 양도 필요")
    @ApiResponse(responseCode = "503", description = "APPLE_REVOKE_UNAVAILABLE·APPLE_REVOKE_NOT_CONFIGURED: Apple 연결 해제 실패, 탈퇴하지 않음")
    public ResponseEntity<Void> withdraw(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody(required = false) WithdrawalRequest request) {
        long userId = userId(jwt);
        apple.revokeIfLinked(userId, request == null ? null : request.appleAuthorizationCode());
        profiles.withdraw(userId);
        return ResponseEntity.noContent().header("Cache-Control", "no-store").build();
    }

    private long userId(Jwt jwt) {
        try {
            return Long.parseLong(jwt.getSubject());
        } catch (NumberFormatException error) {
            throw LoginException.token();
        }
    }
}
