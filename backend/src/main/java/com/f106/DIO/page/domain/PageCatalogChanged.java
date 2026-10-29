package com.f106.DIO.page.domain;
import java.util.UUID;
/** Existing page lifecycle APIs notify clients only after their transaction commits. */
public record PageCatalogChanged(UUID diaryId) {}
