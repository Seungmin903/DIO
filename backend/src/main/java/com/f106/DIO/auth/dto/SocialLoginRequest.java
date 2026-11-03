package com.f106.DIO.auth.dto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;
public record SocialLoginRequest(
 @NotBlank @Size(max=16384) @Schema(accessMode=Schema.AccessMode.WRITE_ONLY,description="Google에서 발급받은 ID 토큰") String idToken,
 @Valid SocialEnrollment enrollment,
 @Size(max=100) String deviceName) {
 @Override public String toString(){return "SocialLoginRequest[credentials=REDACTED]";}
}
