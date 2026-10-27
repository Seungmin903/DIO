package com.f106.DIO.diary.http;

import io.swagger.v3.oas.annotations.media.Schema;

public record MemberDiaryProblem(
    @Schema(requiredMode=Schema.RequiredMode.REQUIRED) int status,
    @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String title,
    @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String code,
    @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String detail
) {}
