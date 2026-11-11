package com.f106.DIO.diary.dto;

import java.time.Instant;
import java.util.List;

@io.swagger.v3.oas.annotations.media.Schema(requiredProperties={"items","nextCursor","hasNext"})
public record DiaryTrashResponse(List<Item> items, @io.swagger.v3.oas.annotations.media.Schema(types={"string","null"}) String nextCursor, boolean hasNext) {
    @io.swagger.v3.oas.annotations.media.Schema(name="MemberDiaryTrashItem",requiredProperties={"diaryId","diaryTitle","coverColor","coverStyle","visibility","createdAt","updatedAt","deletedAt","purgeAt","canRestore","version","canPermanentlyDelete"})
    public record Item(String diaryId, String diaryTitle, String coverColor, String coverStyle,
        String visibility, Instant createdAt, Instant updatedAt, Instant deletedAt,
        Instant purgeAt, boolean canRestore,@io.swagger.v3.oas.annotations.media.Schema(type="string",pattern="^[1-9][0-9]{0,18}$") String version, boolean canPermanentlyDelete,
        // 다이어리 단위 속지 구성(방향 포함). 휴지통 표지를 원래 방향으로 그리는 데 쓴다. 예전 다이어리는 null.
        @io.swagger.v3.oas.annotations.media.Schema(types={"object","null"},description="다이어리 단위 속지 구성(고른 속지 묶음·날짜 표시 방식·방향). 예전에 만든 다이어리는 null") tools.jackson.databind.JsonNode templateConfig) {}
}
