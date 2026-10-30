package com.f106.DIO.sharing.dto;
import java.time.Instant;
public record InviteLinkResponse(boolean available,String token,String inviteUrl,Instant expiresAt) {
    @Override public String toString(){return "InviteLinkResponse[token=REDACTED]";}
}
