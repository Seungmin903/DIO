package com.f106.DIO.auth.login;

import java.util.Locale;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

final class LoginDtos {
    private LoginDtos() {}
    record LoginRequest(
        @NotBlank @Email @Size(max = 254) @Schema(example = "member@example.com") String email,
        @NotBlank @Size(min = 8, max = 32) @Pattern(regexp = "[!-~]{8,32}")
        @Schema(example = "DioMember123!", accessMode = Schema.AccessMode.WRITE_ONLY) String password,
        @Size(max = 100) @Schema(example = "내 휴대폰") String deviceName
    ) {
        LoginRequest { email = email == null ? null : email.strip().toLowerCase(Locale.ROOT); }
        @Override public String toString() { return "LoginRequest[credentials=REDACTED]"; }
    }
    record RefreshRequest(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String refreshToken) {
        @Override public String toString() { return "RefreshRequest[token=REDACTED]"; }
    }
    record User(String userId, String email, String nickname, String profilePhotoUrl) {}
    record Tokens(String tokenType, String accessToken, long expiresIn, String refreshToken, long refreshExpiresIn, User user) {
        @Override public String toString() { return "Tokens[credentials=REDACTED]"; }
    }
}
