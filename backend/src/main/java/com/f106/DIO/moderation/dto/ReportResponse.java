package com.f106.DIO.moderation.dto;
import java.time.Instant;import com.f106.DIO.moderation.domain.UserReport;
public record ReportResponse(long reportId,String status,Instant createdAt){public static ReportResponse of(UserReport r){return new ReportResponse(r.getReportId(),r.getStatus(),r.getCreatedAt());}}
