package com.f106.DIO.user.controller;

import com.f106.DIO.auth.dto.LoginUserResponse;
import com.f106.DIO.user.dto.ProfileUpdateRequest;
import com.f106.DIO.user.service.UserProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
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
    private final UserProfileService profiles;
    public MyProfileController(UserProfileService profiles) { this.profiles = profiles; }

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
    @Operation(summary = "회원 탈퇴", description = "로그인한 계정을 탈퇴 처리하고 모든 로그인 세션을 폐기합니다. 요청 본문은 없습니다.")
    @ApiResponse(responseCode = "204", description = "회원 탈퇴 완료")
    public ResponseEntity<Void> withdraw(@AuthenticationPrincipal Jwt jwt) {
        profiles.withdraw(userId(jwt));
        return ResponseEntity.noContent().header("Cache-Control", "no-store").build();
    }

    private long userId(Jwt jwt) { return Long.parseLong(jwt.getSubject()); }
}
