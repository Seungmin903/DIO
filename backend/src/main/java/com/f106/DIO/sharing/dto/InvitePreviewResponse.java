package com.f106.DIO.sharing.dto;
import java.time.Instant;
import java.util.UUID;
public record InvitePreviewResponse(UUID diaryId,String title,Instant expiresAt,int currentMembers,int maxMembers,boolean full,String inviteType,String status,boolean requiresBlockedMemberConfirmation) {
 public InvitePreviewResponse(UUID diaryId,String title,Instant expiresAt,int currentMembers,int maxMembers,boolean full,String inviteType,String status){this(diaryId,title,expiresAt,currentMembers,maxMembers,full,inviteType,status,false);}
}
