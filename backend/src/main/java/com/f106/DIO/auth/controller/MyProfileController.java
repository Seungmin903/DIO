package com.f106.DIO.auth.controller;

import com.f106.DIO.auth.dto.LoginUserResponse;
import com.f106.DIO.auth.dto.ProfileUpdateRequest;
import com.f106.DIO.auth.service.MyProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me")
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "회원", description = "회원 중복 확인·공개 프로필 사진. 기존 API 경로를 유지합니다.")
public class MyProfileController {
    private final MyProfileService service;
    public MyProfileController(MyProfileService service) { this.service = service; }
    @GetMapping
    @Operation(summary = "내 회원정보 조회", description = "Bearer 토큰의 회원 정보를 반환합니다. 프로필 사진이 없으면 profilePhotoUrl은 null입니다.")
    @ApiResponse(responseCode = "200", description = "회원정보")
    @ApiResponse(responseCode = "401", description = "토큰 없음·만료 또는 비활성 회원")
    public ResponseEntity<LoginUserResponse> get(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.get(jwt));
    }
    @PatchMapping
    @Operation(summary = "내 닉네임 변경", description = "앞뒤 공백 제거·NFKC 정규화 후 한글·영문·숫자·밑줄 2~12자만 허용합니다. 닉네임 중복은 허용합니다. 기존 공유 다이어리의 참여 프로필은 바꾸지 않습니다.")
    @ApiResponse(responseCode = "200", description = "변경된 회원정보")
    @ApiResponse(responseCode = "400", description = "닉네임 형식 오류")
    @ApiResponse(responseCode = "401", description = "토큰 없음·만료 또는 비활성 회원")
    public ResponseEntity<LoginUserResponse> update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileUpdateRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(service.rename(jwt, request.nickname()));
    }
}
