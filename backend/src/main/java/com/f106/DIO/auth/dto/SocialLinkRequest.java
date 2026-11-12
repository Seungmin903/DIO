package com.f106.DIO.auth.dto;

import com.f106.DIO.user.support.UserInput;
import jakarta.validation.constraints.*;

/** Existing email account proof used to attach a verified social identity. */
public record SocialLinkRequest(
    @NotBlank @Size(max=16384) String idToken,
    @NotBlank @Size(max=254) @Pattern(regexp=UserInput.ACCOUNT_EMAIL_PATTERN) String email,
    @NotBlank @Size(min=8,max=32) @Pattern(regexp="[!-~]{8,32}") String password,
    @Size(max=100) String deviceName
) {
    public SocialLinkRequest { email=UserInput.normalizeEmail(email); }
    @Override public String toString(){ return "SocialLinkRequest[credentials=REDACTED]"; }
}
