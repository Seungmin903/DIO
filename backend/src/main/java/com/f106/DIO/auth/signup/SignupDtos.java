package com.f106.DIO.auth.signup;

import java.text.Normalizer;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public final class SignupDtos {
    private SignupDtos() {}
    static String email(String value) { return value == null ? null : value.strip().toLowerCase(Locale.ROOT); }
    static String nickname(String value) {
        return value == null ? null : Normalizer.normalize(value.strip(), Normalizer.Form.NFKC);
    }

    public record NicknameRequest(
        @NotBlank @Pattern(regexp = "[가-힣A-Za-z0-9_]{2,12}")
        @Schema(example = "디오사용자") String nickname
    ) {
        public NicknameRequest { nickname = SignupDtos.nickname(nickname); }
    }

    public record EmailRequest(
        @NotBlank @Email @Size(max = 254)
        @Pattern(regexp = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
        @Schema(example = "member@example.com") String email
    ) {
        public EmailRequest { email = SignupDtos.email(email); }
    }

    public record VerifyRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Pattern(regexp = "[0-9]{6}") @Schema(example = "123456") String code
    ) {
        public VerifyRequest { email = SignupDtos.email(email); }
    }

    public record Agreement(
        @NotNull TermsType termsType,
        @NotBlank @Size(max = 20) @Schema(example = "v1") String termsVersion,
        @NotNull Boolean agreed
    ) {}
    public enum TermsType { SERVICE, PRIVACY, MARKETING }

    @Schema(example = """
        {
          "email": "member@example.com",
          "signupToken": "인증번호 확인 API에서 받은 signupToken으로 교체",
          "password": "DioMember123!",
          "nickname": "디오사용자",
          "agreements": [
            {"termsType": "SERVICE", "termsVersion": "v1", "agreed": true},
            {"termsType": "PRIVACY", "termsVersion": "v1", "agreed": true}
          ]
        }
        """)
    public record SignupRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String signupToken,
        @NotBlank @Size(min = 8, max = 32)
        @Pattern(regexp = "(?=.*[A-Za-z])(?=.*[0-9])[!-~]{8,32}")
        @Schema(example = "DioMember123!", accessMode = Schema.AccessMode.WRITE_ONLY) String password,
        @NotBlank @Pattern(regexp = "[가-힣A-Za-z0-9_]{2,12}") @Schema(example = "디오사용자") String nickname,
        @NotNull @Size(min = 2, max = 3) List<@NotNull @Valid Agreement> agreements
    ) {
        public SignupRequest {
            email = SignupDtos.email(email);
            nickname = SignupDtos.nickname(nickname);
        }
        @Override public String toString() { return "SignupRequest[credentials=REDACTED]"; }
    }

    public record AvailabilityResponse(boolean available) {}
    public record SentResponse(long expiresIn, long resendAfter) {}
    public record VerifiedResponse(String signupToken, long expiresIn) {}
    public record SignupResponse(String userId, String email, String nickname, String profilePhotoUrl,
                                 Instant createdAt) {}
}
