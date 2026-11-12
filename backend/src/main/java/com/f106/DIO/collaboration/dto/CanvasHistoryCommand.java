package com.f106.DIO.collaboration.dto;
import java.util.UUID;
import jakarta.validation.constraints.*;
public record CanvasHistoryCommand(@NotNull @Positive Long operationId,@NotNull UUID clientOperationId,
    @NotNull @PositiveOrZero @Max(2147483646) Integer expectedRevision){}
