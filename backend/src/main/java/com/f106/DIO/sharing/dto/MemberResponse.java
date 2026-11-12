package com.f106.DIO.sharing.dto;
import java.util.UUID;
public record MemberResponse(String userId,String role,String nickname,String profilePhotoUrl,boolean activeAccount,
    String memberColor,String memberNickname,UUID memberProfilePhotoId,boolean usingAccountPhoto,boolean blockedByMe) {
 public MemberResponse(String userId,String role,String nickname,String profilePhotoUrl,boolean activeAccount,String memberColor,String memberNickname,UUID memberProfilePhotoId,boolean usingAccountPhoto){this(userId,role,nickname,profilePhotoUrl,activeAccount,memberColor,memberNickname,memberProfilePhotoId,usingAccountPhoto,false);}
 public MemberResponse withBlockedByMe(boolean blocked){return new MemberResponse(userId,role,nickname,profilePhotoUrl,activeAccount,memberColor,memberNickname,memberProfilePhotoId,usingAccountPhoto,blocked);}
}
