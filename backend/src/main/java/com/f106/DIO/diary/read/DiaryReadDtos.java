package com.f106.DIO.diary.read;

import java.time.Instant;
import java.util.List;
import io.swagger.v3.oas.annotations.media.Schema;

public final class DiaryReadDtos {
    private DiaryReadDtos() {}
    @Schema(name="DiaryReadPermissions", requiredProperties={"canEditMetadata","canEditCanvas","canTrash","canRestore","canPermanentlyDelete"})
    public record Permissions(boolean canEditMetadata, boolean canEditCanvas, boolean canTrash,
                               boolean canRestore, boolean canPermanentlyDelete) {}
    @Schema(name="DiaryReadMembership", requiredProperties={"isFavorite"})
    public record Membership(boolean isFavorite) {}
    @Schema(name="DiaryReadItem", requiredProperties={"version","diaryId","diaryTitle","coverColor","coverStyle","visibility","myRole","myMembership","permissions","pageCount","firstPageId","createdAt","updatedAt","deletedAt","expiresAt"})
    public record Item(@Schema(type="string", pattern="^[1-9][0-9]{0,18}$") String version, String diaryId, String diaryTitle, String coverColor, String coverStyle,
                       String visibility, String myRole, Membership myMembership, Permissions permissions,
                       Long pageCount, @Schema(types={"string","null"}, format="uuid") String firstPageId, Instant createdAt, Instant updatedAt,
                       @Schema(types={"string","null"}, format="date-time") Instant deletedAt,
                       @Schema(types={"string","null"}, format="date-time") Instant expiresAt) {}
    @Schema(name="DiaryReadPage", requiredProperties={"items","nextCursor","hasNext"})
    public record Page(List<Item> items, @Schema(types={"string","null"}) String nextCursor, boolean hasNext) {}
    @Schema(name="DiaryReadDetail", requiredProperties={"diary"})
    public record Detail(Item diary) {}
}
