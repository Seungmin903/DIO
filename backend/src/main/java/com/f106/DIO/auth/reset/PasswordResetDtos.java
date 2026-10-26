package com.f106.DIO.auth.reset;

import java.util.Locale;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

public final class PasswordResetDtos {
    private PasswordResetDtos() {}
    private static String normalize(String email) { return email == null ? null : email.strip().toLowerCase(Locale.ROOT); }
    public record VerifyRequest(
        @NotBlank @Email @Size(max = 254) @Schema(example = "member@example.com") String email,
        @NotBlank @Pattern(regexp = "[0-9]{6}") @Schema(example = "123456", accessMode = Schema.AccessMode.WRITE_ONLY) String code
    ) {
        public VerifyRequest { email = normalize(email); }
        @Override public String toString() { return "VerifyRequest[REDACTED]"; }
    }
    public record ResetRequest(
        @NotBlank @Email @Size(max = 254) @Schema(example = "member@example.com") String email,
        @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}")
        @Schema(description = "인증번호 확인 응답의 일회용 resetToken", accessMode = Schema.AccessMode.WRITE_ONLY) String resetToken,
        @NotBlank @Pattern(regexp = "(?=.*[A-Za-z])(?=.*[0-9])[!-~]{8,32}")
        @Schema(example = "NewDioMember123!", accessMode = Schema.AccessMode.WRITE_ONLY) String newPassword
    ) {
        public ResetRequest { email = normalize(email); }
        @Override public String toString() { return "ResetRequest[REDACTED]"; }
    }
    public record SentResponse(String message, long expiresIn, long resendAfter) {}
    public record VerifiedResponse(String resetToken, long expiresIn) {
        @Override public String toString() { return "VerifiedResponse[REDACTED]"; }
    }
}
