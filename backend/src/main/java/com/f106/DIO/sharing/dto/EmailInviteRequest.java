package com.f106.DIO.sharing.dto;
import com.f106.DIO.user.support.UserInput;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;
public record EmailInviteRequest(@NotBlank @Size(max=254) @Pattern(regexp = UserInput.ACCOUNT_EMAIL_PATTERN) @Schema(example="friend@example.com") String email) {
    public EmailInviteRequest {email=UserInput.normalizeEmail(email);}
    @Override public String toString(){return "EmailInviteRequest[email=REDACTED]";}
}
