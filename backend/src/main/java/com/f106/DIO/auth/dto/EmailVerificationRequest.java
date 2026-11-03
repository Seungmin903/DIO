package com.f106.DIO.auth.dto;

import com.f106.DIO.user.support.UserInput;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;

@Schema(name = "VerifyRequest")
public record EmailVerificationRequest(
    @NotBlank @Size(max = 254) @Pattern(regexp = UserInput.EMAIL_PATTERN) String email,
    @NotBlank @Pattern(regexp = "[0-9]{6}") @Schema(example = "123456") String code
) {
    public EmailVerificationRequest { email = UserInput.normalizeEmail(email); }
}
