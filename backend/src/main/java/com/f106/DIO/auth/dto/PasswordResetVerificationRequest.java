package com.f106.DIO.auth.dto;

import com.f106.DIO.user.support.UserInput;

import java.util.Locale;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

public record PasswordResetVerificationRequest(
    @NotBlank @Size(max = 254) @Pattern(regexp = UserInput.EMAIL_PATTERN) @Schema(example = "member@example.com") String email,
    @NotBlank @Pattern(regexp = "[0-9]{6}") @Schema(example = "123456", accessMode = Schema.AccessMode.WRITE_ONLY) String code
) {
    public PasswordResetVerificationRequest { email = UserInput.normalizeEmail(email); }
    @Override public String toString() { return "PasswordResetVerificationRequest[REDACTED]"; }
}
