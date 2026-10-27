package com.f106.DIO.user.dto;

import com.f106.DIO.user.support.UserInput;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

public record EmailRequest(
    @NotBlank @Email @Size(max = 254)
    @Pattern(regexp = UserInput.EMAIL_PATTERN)
    @Schema(example = "member@example.com") String email
) {
    public EmailRequest { email = UserInput.normalizeEmail(email); }
}
