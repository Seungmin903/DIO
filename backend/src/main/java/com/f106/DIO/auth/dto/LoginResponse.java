package com.f106.DIO.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(name = "Tokens")
public record LoginResponse(String tokenType, String accessToken, long expiresIn, String refreshToken, long refreshExpiresIn, LoginUserResponse user) {
    @Override public String toString() { return "LoginResponse[credentials=REDACTED]"; }
}
