package com.f106.DIO.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(name = "User")
public record LoginUserResponse(String userId, String email, String nickname, String profilePhotoUrl) {}
