package com.f106.DIO.sharing.dto;
import java.time.Instant;
import java.util.UUID;
public record EmailInviteResponse(String inviteId,UUID diaryId,String diaryTitle,String inviterUserId,String inviterNickname,
    String recipientUserId,String recipientNickname,String recipientEmail,String status,Instant createdAt,Instant expiresAt,
    String token,String inviteUrl) {
    @Override public String toString(){return "EmailInviteResponse[id="+inviteId+",status="+status+",privateFields=REDACTED]";}
}
