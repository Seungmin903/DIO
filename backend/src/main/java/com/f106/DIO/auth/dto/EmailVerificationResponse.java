package com.f106.DIO.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(name = "VerifiedResponse")
public record EmailVerificationResponse(String signupToken, long expiresIn) {}
