package com.f106.DIO.auth.dto;



import java.util.Locale;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

public record PasswordResetVerificationResponse(String resetToken, long expiresIn) {
    @Override public String toString() { return "PasswordResetVerificationResponse[REDACTED]"; }
}
