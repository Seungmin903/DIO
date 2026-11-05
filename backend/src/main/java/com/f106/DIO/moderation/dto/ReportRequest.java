package com.f106.DIO.moderation.dto;
import java.util.UUID;import jakarta.validation.constraints.*;import com.f106.DIO.moderation.domain.ReportReason;
public record ReportRequest(@NotNull @Positive Long reportedUserId,@NotNull UUID diaryId,@NotNull ReportReason reasonCode,
 @Size(max=1000) String description,@NotNull UUID clientRequestId) {}
