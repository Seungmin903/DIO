package com.f106.DIO.auth.signup;

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
@Tag(name = "일반 회원가입", description = "토큰 없이 호출합니다. 이메일 인증 후 가입하며 로그인 토큰은 발급하지 않습니다.")
public class SignupController {
    private final EmailSignupService signup;
    private final EmailVerificationService verification;
    public SignupController(EmailSignupService signup, EmailVerificationService verification) {
        this.signup = signup; this.verification = verification;
    }
    @PostMapping("/email-availability")
    @Operation(summary = "이메일 중복 확인", description = "이메일은 앞뒤 공백 제거·소문자로 정규화합니다. 가입 시 다시 중복 검사합니다.")
    public ResponseEntity<SignupDtos.AvailabilityResponse> available(@Valid @RequestBody SignupDtos.EmailRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(signup.available(request.email()));
    }
    @PostMapping("/nickname-availability")
    @Operation(summary = "닉네임 중복 확인", description = "인증 없이 호출합니다. 앞뒤 공백 제거·NFKC 정규화 후 한글·영문·숫자·밑줄 2~12자. 영문 대소문자를 구분하지 않으며 관리자/dio는 사용할 수 없습니다. 확인 결과는 닉네임을 예약하지 않으며 가입 시 다시 검사합니다.")
    @ApiResponse(responseCode = "200", description = "available=true 사용 가능, false 중복 또는 예약어")
    @ApiResponse(responseCode = "400", description = "닉네임 입력 형식 오류")
    public ResponseEntity<SignupDtos.AvailabilityResponse> nicknameAvailable(@Valid @RequestBody SignupDtos.NicknameRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(signup.nicknameAvailable(request.nickname()));
    }
    @PostMapping("/email-verifications")
    @Operation(summary = "회원가입 인증번호 발송", description = "6자리 번호, 유효기간 600초, 이메일별 재발송 간격 60초. SMTP와 비밀키 설정 필요. 번호는 응답하지 않습니다.")
    @ApiResponse(responseCode = "200", description = "인증 메일 발송 완료")
    @ApiResponse(responseCode = "429", description = "재발송 제한")
    @ApiResponse(responseCode = "503", description = "이메일 인증 설정 또는 발송 실패")
    public ResponseEntity<SignupDtos.SentResponse> send(@Valid @RequestBody SignupDtos.EmailRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(verification.send(request.email()));
    }
    @PostMapping("/email-verifications/verify")
    @Operation(summary = "회원가입 인증번호 확인", description = "오답 최대 5회. 성공 시 600초 유효한 일회용 signupToken을 발급합니다. 번호 재사용은 불가합니다.")
    @ApiResponse(responseCode = "200", description = "인증 성공 및 가입 토큰 발급")
    @ApiResponse(responseCode = "400", description = "잘못되거나 만료된 인증번호")
    @ApiResponse(responseCode = "429", description = "오답 횟수 초과")
    public ResponseEntity<SignupDtos.VerifiedResponse> verify(@Valid @RequestBody SignupDtos.VerifyRequest request) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(verification.verify(request));
    }
    @PostMapping(value = "/signup", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "일반 회원가입", description = "같은 이메일의 signupToken 필요. 영문·숫자 포함 ASCII 비밀번호 8~32자, 닉네임 한글·영문·숫자·밑줄 2~12자. SERVICE/PRIVACY 필수, MARKETING 선택. 기본 약관 버전 v1은 운영 전 실제 버전으로 설정해야 합니다.")
    @ApiResponse(responseCode = "201", description = "가입 완료. 로그인은 별도로 진행합니다.")
    @ApiResponse(responseCode = "400", description = "입력·인증 토큰·약관 오류")
    @ApiResponse(responseCode = "409", description = "이메일·닉네임 중복 또는 동시 요청 충돌")
    public ResponseEntity<SignupDtos.SignupResponse> signup(@Valid @RequestBody SignupDtos.SignupRequest request) {
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
    public ResponseEntity<SignupDtos.SignupResponse> signupWithPhoto(
            @Valid @RequestPart("signup") SignupDtos.SignupRequest request,
            @RequestPart(value = "photo", required = false) MultipartFile photo) {
        return ResponseEntity.status(201).header("Cache-Control", "no-store").body(signup.signup(request, photo));
    }
    @GetMapping(value = "/profile-photos/{photoId}", produces = MediaType.IMAGE_PNG_VALUE)
    @Operation(summary = "프로필 사진 조회", description = "회원가입 응답의 profilePhotoUrl을 사용합니다. 공개 프로필 이미지이며 인증 없이 조회합니다. 탈퇴·비활성 회원의 사진은 반환하지 않습니다.")
    @ApiResponse(responseCode = "200", description = "PNG 이미지")
    @ApiResponse(responseCode = "404", description = "사진 없음 또는 비활성 회원")
    public ResponseEntity<byte[]> photo(@PathVariable UUID photoId) {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).header("Cache-Control", "no-store")
            .header("X-Content-Type-Options", "nosniff").body(signup.profilePhoto(photoId));
    }
}
