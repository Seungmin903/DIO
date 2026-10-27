package com.f106.DIO.auth.dto;



import java.util.Locale;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

public record PasswordResetSentResponse(String message, long expiresIn, long resendAfter) {}
