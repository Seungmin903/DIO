package com.f106.DIO.sharing.domain;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="diary_invites") @lombok.Getter
public class DiaryInvite {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long inviteId;
    @Column(nullable=false) private UUID diaryId;
    @Column(nullable=false) private Long inviterUserId;
    private Long inviteeUserId;
    @Column(nullable=false,length=20) private String inviteType;
    @Column(nullable=false,columnDefinition="bytea") @JdbcTypeCode(SqlTypes.VARBINARY) private byte[] tokenHash;
    @Column(nullable=false,length=20) private String role;
    private Integer maxUses;
    @Column(nullable=false) private int useCount;
    @Column(nullable=false) private Instant expiresAt;
    private Instant revokedAt;
    @Column(nullable=false) private Instant createdAt;
    protected DiaryInvite() {}
    public DiaryInvite(UUID diary,Long actor,Instant now) {
        diaryId=diary;inviterUserId=actor;inviteType="LINK";role="EDITOR";createdAt=now;
        expiresAt=now.plusSeconds(SharingPolicy.INVITE_TTL_SECONDS);tokenHash=new byte[32];
    }
    // No schema change: EMAIL states use invite_type; expires_at remains NOT NULL.
    public static final Instant NO_EXPIRY = Instant.parse("9999-12-31T23:59:59Z");
    public static DiaryInvite email(UUID diary,Long actor,Long recipient,Instant now) {
        var invite=new DiaryInvite(diary,actor,now);
        invite.inviteeUserId=recipient;invite.inviteType="EMAIL";invite.expiresAt=NO_EXPIRY;invite.maxUses=1;
        return invite;
    }
    public boolean email() {return inviteType.startsWith("EMAIL");}
    public boolean pendingEmail() {return "EMAIL".equals(inviteType)&&revokedAt==null&&useCount==0;}
    public Instant publicExpiresAt() {return email()?null:expiresAt;}
    public String status() {
        return switch(inviteType) {
            case "EMAIL_ACCEPTED" -> "ACCEPTED";
            case "EMAIL_DECLINED" -> "DECLINED";
            case "EMAIL_CANCELLED" -> "CANCELLED";
            case "EMAIL_FAILED" -> "DELIVERY_FAILED";
            default -> revokedAt!=null?"CANCELLED":(!email()&&!expiresAt.isAfter(Instant.now())?"EXPIRED":"PENDING");
        };
    }
    public void acceptedEmail() {if(pendingEmail()){inviteType="EMAIL_ACCEPTED";useCount=1;}}
    public void cancel(Instant now) {revokedAt=now;if(email())inviteType="EMAIL_CANCELLED";}
    public void decline(Instant now) {revokedAt=now;inviteType="EMAIL_DECLINED";}
    public void deliveryFailed(Instant now) {if(pendingEmail()){revokedAt=now;inviteType="EMAIL_FAILED";}}
    public void initializeHash(byte[] hash) {tokenHash=hash.clone();}
    public void used() {useCount++;}
}
