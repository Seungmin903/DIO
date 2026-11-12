package com.f106.DIO.user.controller;

import com.f106.DIO.user.dto.AvailabilityResponse;
import com.f106.DIO.user.dto.EmailRequest;

import com.f106.DIO.user.service.UserPhotoService;
import com.f106.DIO.user.service.UserService;
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
@Tag(name = "회원", description = "회원 중복 확인·공개 프로필 사진. 기존 API 경로를 유지합니다.")
public class UserController {
    private final UserService users;
    private final UserPhotoService photos;
    public UserController(UserService users, UserPhotoService photos) { this.users = users; this.photos = photos; }
    @PostMapping("/email-availability")
    @Operation(summary = "이메일 중복 확인", description = "이메일은 앞뒤 공백 제거·소문자로 정규화합니다. 가입 시 다시 중복 검사합니다.")
    public ResponseEntity<AvailabilityResponse> available(@Valid @RequestBody EmailRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(users.available(request.email()));
    }
    @GetMapping(value = "/profile-photos/{photoId}", produces = MediaType.IMAGE_PNG_VALUE)
    @Operation(summary = "프로필 사진 조회", description = "회원가입 응답의 profilePhotoUrl을 사용합니다. 공개 프로필 이미지이며 인증 없이 조회합니다. 탈퇴·비활성 회원의 사진은 반환하지 않습니다.")
    @ApiResponse(responseCode = "200", description = "PNG 이미지")
    @ApiResponse(responseCode = "404", description = "사진 없음 또는 비활성 회원")
    public ResponseEntity<byte[]> photo(@PathVariable UUID photoId) {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).header("Cache-Control", "no-store")
            .header("X-Content-Type-Options", "nosniff").body(photos.read(photoId));
    }
}
