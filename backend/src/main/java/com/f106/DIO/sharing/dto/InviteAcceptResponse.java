package com.f106.DIO.sharing.dto;
import java.util.UUID;
public record InviteAcceptResponse(UUID diaryId,String role,boolean alreadyMember,int currentMembers,int maxMembers) {}
