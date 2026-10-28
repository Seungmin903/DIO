package com.f106.DIO.auth.dto;

import java.time.Instant;

public record SignupResponse(String userId, String email, String nickname, String profilePhotoUrl,
                             Instant createdAt) {}
