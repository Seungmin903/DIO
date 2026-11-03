package com.f106.DIO.notification.event;

import java.time.Instant;
import java.util.*;
import com.f106.DIO.sharing.domain.SharingPolicy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import com.f106.DIO.sharing.service.SharingAccessService;

/** 쓰기 적격성은 기존 공유 다이어리 잠금 아래에서 확인한다. */
@Component
@Transactional(propagation=Propagation.MANDATORY)
public class SharedInvitationNotificationSource implements InvitationNotificationSource {
    private final JdbcTemplate jdbc;
    private final SharingAccessService access;
    public SharedInvitationNotificationSource(JdbcTemplate jdbc,SharingAccessService access){this.jdbc=jdbc;this.access=access;}
    public Optional<Snapshot> findForNotification(long inviteId,long recipient) {
        var diaries=jdbc.query("select diary_id from diary_invites where invite_id=? and invitee_user_id=?",(rs,n)->rs.getObject(1,UUID.class),inviteId,recipient);
        if(diaries.isEmpty())return Optional.empty();
        access.lock(diaries.get(0));
        return jdbc.query("""
            select i.*,u.status as user_status,u.deleted_at as user_deleted,
            exists(select 1 from diary_members m where m.diary_id=i.diary_id and m.user_id=? and m.left_at is null) as joined
            from diary_invites i join users u on u.user_id=i.invitee_user_id
            where i.invite_id=? and i.invitee_user_id=?
            """,(rs,n)->{
                String type=rs.getString("invite_type");
                boolean email=type.startsWith("EMAIL");
                Eligibility eligible=Eligibility.INELIGIBLE;
                if(type.equals("EMAIL") && rs.getTimestamp("revoked_at")==null && rs.getInt("use_count")==0
                    && rs.getString("user_status").equals("ACTIVE") && rs.getTimestamp("user_deleted")==null && !rs.getBoolean("joined")) eligible=Eligibility.NOTIFIABLE;
                if(type.equals("EMAIL_CANCELLED")||(type.equals("EMAIL") && rs.getTimestamp("revoked_at")!=null))eligible=Eligibility.REVOKED;
                var expiresAt=rs.getTimestamp("expires_at").toInstant();
                if(email) {
                    // V28 이전 초대는 9999년 만료값이 남아 있으므로 생성 후 7일을 상한으로 본다.
                    var limit=rs.getTimestamp("created_at").toInstant().plusSeconds(SharingPolicy.EMAIL_INVITE_TTL_SECONDS);
                    if(limit.isBefore(expiresAt))expiresAt=limit;
                    if(eligible==Eligibility.NOTIFIABLE && !expiresAt.isAfter(Instant.now()))eligible=Eligibility.EXPIRED;
                }
                return new Snapshot(inviteId,recipient,rs.getLong("inviter_user_id"),rs.getObject("diary_id",UUID.class),email?Kind.DIRECT:Kind.LINK,eligible,expiresAt);
            },recipient,inviteId,recipient).stream().findFirst();
    }
}
