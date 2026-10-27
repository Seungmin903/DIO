package com.f106.DIO.user.dto;

import com.f106.DIO.user.domain.TermsType;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;
public record Agreement(@NotNull TermsType termsType,
    @NotBlank @Size(max = 20) @Schema(example = "v1") String termsVersion,
    @NotNull Boolean agreed) {}
