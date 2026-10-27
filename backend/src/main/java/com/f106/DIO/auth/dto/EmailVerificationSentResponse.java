package com.f106.DIO.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(name = "SentResponse")
public record EmailVerificationSentResponse(long expiresIn, long resendAfter) {}
