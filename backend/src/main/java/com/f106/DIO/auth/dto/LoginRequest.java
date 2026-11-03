package com.f106.DIO.auth.dto;

import com.f106.DIO.user.support.UserInput;
import java.util.Locale;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

public record LoginRequest(
    @NotBlank @Size(max = 254) @Pattern(regexp = UserInput.EMAIL_PATTERN) @Schema(example = "member@example.com") String email,
    @NotBlank @Size(min = 8, max = 32) @Pattern(regexp = "[!-~]{8,32}")
    @Schema(example = "DioMember123!", accessMode = Schema.AccessMode.WRITE_ONLY) String password,
    @Size(max = 100) @Schema(example = "내 휴대폰") String deviceName
) {
    public LoginRequest { email = UserInput.normalizeEmail(email); }
    @Override public String toString() { return "LoginRequest[credentials=REDACTED]"; }
}
