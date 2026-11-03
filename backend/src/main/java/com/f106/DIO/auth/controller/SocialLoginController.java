package com.f106.DIO.auth.controller;
import com.f106.DIO.auth.domain.SocialProvider;
import com.f106.DIO.auth.dto.*;
import com.f106.DIO.auth.exception.SocialLoginException;
import com.f106.DIO.auth.service.SocialLoginService;
import com.f106.DIO.auth.support.LoginThrottle;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController @RequestMapping("/api/v1/auth/oauth") @Tag(name="인증")
public class SocialLoginController {
 private final SocialLoginService service;private final LoginThrottle throttle;
 public SocialLoginController(SocialLoginService service,LoginThrottle throttle){this.service=service;this.throttle=throttle;}
 @PostMapping(value="/{provider}",consumes=MediaType.APPLICATION_JSON_VALUE)
 @Operation(summary="소셜 로그인·가입",description="google, apple 지원. 제공자 ID 토큰(Google ID 토큰, Apple identityToken)을 검증하여 기존 회원은 DIO 토큰을 발급합니다. 신규 회원은 409 SOCIAL_SIGNUP_REQUIRED 후 같은 경로로 enrollment(닉네임, ageConfirmed=true, agreements)를 보내 가입합니다. 사진은 multipart의 oauth JSON과 photo 파트로 전송합니다. 이메일이 같아도 기존 계정과 자동 연결하지 않습니다.")
 public ResponseEntity<LoginResponse> login(@PathVariable String provider,@Valid @RequestBody SocialLoginRequest body,HttpServletRequest request){return handle(provider,body,null,request);}
 @PostMapping(value="/{provider}",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
 public ResponseEntity<LoginResponse> signup(@PathVariable String provider,@Valid @RequestPart("oauth") SocialLoginRequest body,@RequestPart(value="photo",required=false) MultipartFile photo,HttpServletRequest request){return handle(provider,body,photo,request);}
 private ResponseEntity<LoginResponse> handle(String name,SocialLoginRequest body,MultipartFile photo,HttpServletRequest request){
  SocialProvider provider;
  try {provider=SocialProvider.valueOf(name.toUpperCase(java.util.Locale.ROOT));}
  catch(IllegalArgumentException error){throw new SocialLoginException(HttpStatus.BAD_REQUEST,"INVALID_SOCIAL_PROVIDER","로그인 방식을 확인해 주세요.");}
  var reservation=throttle.reserve("social:"+provider,request.getRemoteAddr());
  try {
   var response=service.authenticate(provider,body.idToken(),body.enrollment(),body.deviceName(),photo);
   throttle.success(reservation);return ResponseEntity.ok().header("Cache-Control","no-store").body(response);
  }catch(SocialLoginException error){if("INVALID_SOCIAL_CREDENTIAL".equals(error.code))throttle.failed(reservation);throw error;}
  finally {throttle.cancel(reservation);}
 }
}
