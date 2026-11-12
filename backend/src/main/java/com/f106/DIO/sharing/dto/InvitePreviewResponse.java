package com.f106.DIO.sharing.dto;
import java.time.Instant;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

public record InvitePreviewResponse(
    UUID diaryId, String title, Instant expiresAt, int currentMembers, int maxMembers,
    boolean full, String inviteType, String status, boolean requiresBlockedMemberConfirmation,
    String pageSize, String coverColor, String coverStyle, JsonNode cover
) {}
