package com.f106.DIO.sharing.dto;
import java.util.UUID;
public record MemberResponse(String userId,String role,String nickname,String profilePhotoUrl,boolean activeAccount,
    String memberColor,String memberNickname,UUID memberProfilePhotoId,boolean usingAccountPhoto) {}
