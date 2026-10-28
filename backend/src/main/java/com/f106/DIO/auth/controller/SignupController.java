package com.f106.DIO.auth.controller;

import com.f106.DIO.auth.dto.SignupRequest;
import com.f106.DIO.auth.dto.SignupResponse;

import com.f106.DIO.auth.service.EmailSignupService;
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
@Tag(name = "일반 회원가입", description = "이메일 인증 후 회원가입합니다.")
public class SignupController {
    private final EmailSignupService signup;
    public SignupController(EmailSignupService signup) { this.signup = signup; }
    @PostMapping(value = "/signup", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "일반 회원가입", description = "같은 이메일의 signupToken 필요. 영문·숫자 포함 ASCII 비밀번호 8~32자, 닉네임 한글·영문·숫자·밑줄 2~12자. SERVICE/PRIVACY 필수, MARKETING 선택. 기본 약관 버전 v1은 운영 전 실제 버전으로 설정해야 합니다.")
    @ApiResponse(responseCode = "201", description = "가입 완료. 로그인은 별도로 진행합니다.")
    @ApiResponse(responseCode = "400", description = "입력·인증 토큰·약관 오류")
    @ApiResponse(responseCode = "409", description = "이메일·닉네임 중복 또는 동시 요청 충돌")
    public ResponseEntity<SignupResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ResponseEntity.status(201).header("Cache-Control", "no-store").body(signup.signup(request));
    }
    @PostMapping(value = "/signup", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "일반 회원가입 (사진 선택)", description = "signup 파트는 application/json 형식의 가입 정보, photo 파트는 선택한 JPEG/PNG 파일입니다. 사진은 5MB·1600만 화소 이하, 서버에서 긴 변 512px 이하 PNG로 저장합니다. 회원·사진 참조는 같은 DB 트랜잭션으로 저장하고, 실패 시 업로드 파일 정리를 시도합니다. 사진 없이 application/json 요청도 가능합니다.",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content =
            @io.swagger.v3.oas.annotations.media.Content(mediaType = MediaType.MULTIPART_FORM_DATA_VALUE,
                encoding = @io.swagger.v3.oas.annotations.media.Encoding(name = "signup", contentType = MediaType.APPLICATION_JSON_VALUE))))
    @ApiResponse(responseCode = "201", description = "가입 완료. 사진 선택 시 profilePhotoUrl 반환")
    @ApiResponse(responseCode = "400", description = "가입 정보 또는 사진 형식 오류")
    @ApiResponse(responseCode = "413", description = "사진 또는 요청 크기 초과")
    public ResponseEntity<SignupResponse> signupWithPhoto(
            @Valid @RequestPart("signup") SignupRequest request,
            @RequestPart(value = "photo", required = false) MultipartFile photo) {
        return ResponseEntity.status(201).header("Cache-Control", "no-store").body(signup.signup(request, photo));
    }
}
