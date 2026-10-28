package com.f106.DIO.sharing.dto;
import java.time.Instant;
// Preserve the existing link fields and append the paginated sent-email list.
public record DiaryInvitationsResponse(boolean available,String token,String inviteUrl,Instant expiresAt,String linkInviteId,EmailInvitePageResponse emailInvites) {
    @Override public String toString(){return "DiaryInvitationsResponse[privateFields=REDACTED]";}
}
