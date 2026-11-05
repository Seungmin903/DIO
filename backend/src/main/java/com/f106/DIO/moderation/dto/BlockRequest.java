package com.f106.DIO.moderation.dto;
import java.util.UUID;import jakarta.validation.constraints.NotNull;
public record BlockRequest(@NotNull UUID diaryId) {}
