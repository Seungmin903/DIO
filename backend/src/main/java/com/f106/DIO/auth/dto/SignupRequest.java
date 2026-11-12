package com.f106.DIO.auth.dto;

import com.f106.DIO.user.dto.Agreement;
import com.f106.DIO.user.support.UserInput;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

@Schema(example = """
    {
      "email": "member@example.com",
      "signupToken": "인증번호 확인 API에서 받은 signupToken으로 교체",
      "password": "DioMember123!",
      "nickname": "디오사용자",
      "ageConfirmed": true,
      "agreements": [
        {"termsType": "SERVICE", "termsVersion": "v2", "agreed": true},
        {"termsType": "PRIVACY", "termsVersion": "v2", "agreed": true},
        {"termsType": "MARKETING_PRIVACY", "termsVersion": "v1", "agreed": false},
        {"termsType": "AD_EMAIL", "termsVersion": "v1", "agreed": false},
        {"termsType": "AD_PUSH", "termsVersion": "v1", "agreed": false},
        {"termsType": "AD_NIGHT_PUSH", "termsVersion": "v1", "agreed": false}
      ]
    }
    """)
public record SignupRequest(
    @NotBlank @Size(max = 254) @Pattern(regexp = UserInput.EMAIL_PATTERN) String email,
    @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String signupToken,
    @NotBlank @Size(min = 8, max = 32)
    @Pattern(regexp = "(?=.*[A-Za-z])(?=.*[0-9])[!-~]{8,32}")
    @Schema(example = "DioMember123!", accessMode = Schema.AccessMode.WRITE_ONLY) String password,
    @NotBlank @Pattern(regexp = "[가-힣A-Za-z0-9_]{2,12}") @Schema(example = "디오사용자") String nickname,
    @NotNull @Size(min = 2, max = 7) List<@NotNull @Valid Agreement> agreements,
    @NotNull @AssertTrue @Schema(description = "만 14세 이상이라는 본인 확인. 생년월일은 수집하지 않으며 실제 연령 인증을 뜻하지 않습니다.", example = "true") Boolean ageConfirmed
) {
    public SignupRequest {
        email = UserInput.normalizeEmail(email);
        nickname = UserInput.normalizeNickname(nickname);
    }
    @Override public String toString() { return "SignupRequest[credentials=REDACTED]"; }
}
