package com.f106.DIO.sharing.dto;
import java.time.Instant;
import java.util.UUID;
public record DiaryProfileResponse(UUID diaryId,String userId,String role,boolean favorite,UUID lastOpenedPageId,Instant lastOpenedAt,
    String nickname,String memberNickname,UUID memberProfilePhotoId,String profilePhotoUrl,String memberColor,boolean usingAccountPhoto) {}
