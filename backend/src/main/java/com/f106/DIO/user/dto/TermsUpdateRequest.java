package com.f106.DIO.user.dto;

import jakarta.validation.constraints.NotNull;
import io.swagger.v3.oas.annotations.media.Schema;

public record TermsUpdateRequest(@NotNull @Schema(example="true",description="동의 여부. MARKETING만 false로 철회 가능") Boolean agreed) {}
