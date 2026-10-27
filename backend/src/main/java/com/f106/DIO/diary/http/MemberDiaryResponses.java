package com.f106.DIO.diary.http;

import java.time.Instant;
import java.util.List;
import com.f106.DIO.diary.dto.DiaryCreateResponse.DiaryData;
import io.swagger.v3.oas.annotations.media.Schema;

public final class MemberDiaryResponses {
    private MemberDiaryResponses() {}
    public record Diary(
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED,format="uuid") String diaryId,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String diaryTitle,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String coverColor,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String coverStyle,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String visibility,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) Instant createdAt,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) Instant updatedAt,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) boolean canEdit
    ) {
        static Diary from(DiaryData d,boolean canEdit) { return new Diary(d.diaryId(),d.diaryTitle(),d.coverColor(),d.coverStyle(),d.visibility(),d.createdAt(),d.updatedAt(),canEdit); }
    }
    public record Detail(@Schema(requiredMode=Schema.RequiredMode.REQUIRED) Diary diary) {}
    public record Created(@Schema(requiredMode=Schema.RequiredMode.REQUIRED) Diary diary,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED,format="uuid") String firstPageId,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) List<String> pageIds) {}
}
