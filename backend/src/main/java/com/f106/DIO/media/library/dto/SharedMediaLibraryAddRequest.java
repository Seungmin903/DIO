package com.f106.DIO.media.library.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

public record SharedMediaLibraryAddRequest(@NotNull UUID mediaFileId) {}
