package com.f106.DIO.sharing.dto;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;
public record EmailInviteRequest(@NotBlank @Email @Size(max=254) @Schema(example="friend@example.com") String email) {
    public EmailInviteRequest {email=email==null?null:email.strip().toLowerCase(java.util.Locale.ROOT);}
    @Override public String toString(){return "EmailInviteRequest[email=REDACTED]";}
}
