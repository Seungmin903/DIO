package com.f106.DIO.auth.dto;

import com.f106.DIO.user.support.UserInput;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

/** Same JSON contract as before; existing accounts are not subject to new-signup syntax. */
public record PasswordResetEmailRequest(
    @NotBlank @Size(max = 254) @Pattern(regexp = UserInput.ACCOUNT_EMAIL_PATTERN)
    @Schema(example = "member@example.com") String email
) {
    public PasswordResetEmailRequest { email = UserInput.normalizeEmail(email); }
    @Override public String toString() { return "PasswordResetEmailRequest[email=REDACTED]"; }
}
