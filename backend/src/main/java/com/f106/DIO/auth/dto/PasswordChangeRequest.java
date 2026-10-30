package com.f106.DIO.auth.dto;

import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;

public record PasswordChangeRequest(
    @NotBlank @Size(max=32) @Schema(accessMode=Schema.AccessMode.WRITE_ONLY) String currentPassword,
    @NotBlank @Pattern(regexp="(?=.*[A-Za-z])(?=.*[0-9])[!-~]{8,32}")
    @Schema(example="ChangedDio123!",accessMode=Schema.AccessMode.WRITE_ONLY) String newPassword
){
    @Override public String toString(){return "PasswordChangeRequest[REDACTED]";}
}
