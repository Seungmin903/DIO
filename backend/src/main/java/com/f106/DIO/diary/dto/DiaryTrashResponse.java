package com.f106.DIO.diary.dto;

import java.time.Instant;
import java.util.List;

public record DiaryTrashResponse(List<Item> items, String nextCursor, boolean hasNext) {
    public record Item(String diaryId, String diaryTitle, String coverColor, String coverStyle,
        String visibility, Instant createdAt, Instant updatedAt, Instant deletedAt,
        Instant purgeAt, boolean canRestore) {}
}
