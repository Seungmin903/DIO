package com.f106.DIO.auth.dto;

import com.f106.DIO.user.support.UserInput;

import java.util.Locale;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

public record PasswordResetRequest(
    @NotBlank @Email @Size(max = 254) @Schema(example = "member@example.com") String email,
    @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}")
    @Schema(description = "인증번호 확인 응답의 일회용 resetToken", accessMode = Schema.AccessMode.WRITE_ONLY) String resetToken,
    @NotBlank @Pattern(regexp = "(?=.*[A-Za-z])(?=.*[0-9])[!-~]{8,32}")
    @Schema(example = "NewDioMember123!", accessMode = Schema.AccessMode.WRITE_ONLY) String newPassword
) {
    public PasswordResetRequest { email = UserInput.normalizeEmail(email); }
    @Override public String toString() { return "PasswordResetRequest[REDACTED]"; }
}
