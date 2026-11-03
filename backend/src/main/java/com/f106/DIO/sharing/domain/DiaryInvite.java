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
    @Column(nullable=false) private Instant retentionUntil;
    private Instant revokedAt;
    @Column(nullable=false) private Instant createdAt;
    protected DiaryInvite() {}
    public DiaryInvite(UUID diary,Long actor,Instant now) {
        diaryId=diary;inviterUserId=actor;inviteType="LINK";role="EDITOR";createdAt=now;
        expiresAt=now.plusSeconds(SharingPolicy.INVITE_TTL_SECONDS);retentionUntil=expiresAt;tokenHash=new byte[32];
    }
    public static DiaryInvite email(UUID diary,Long actor,Long recipient,Instant now) {
        var invite=new DiaryInvite(diary,actor,now);
        invite.inviteeUserId=recipient;invite.inviteType="EMAIL";invite.expiresAt=now.plusSeconds(SharingPolicy.EMAIL_INVITE_TTL_SECONDS);invite.retentionUntil=invite.expiresAt;invite.maxUses=1;
        return invite;
    }
    public boolean email() {return inviteType.startsWith("EMAIL");}
    /** V28 이전 이메일 초대는 토큰 서명이 바뀌지 않도록 9999년 만료값을 그대로 두고, 생성 후 7일을 상한으로 본다. */
    public Instant effectiveExpiresAt() {
        if(!email())return expiresAt;
        Instant limit=createdAt.plusSeconds(SharingPolicy.EMAIL_INVITE_TTL_SECONDS);
        return expiresAt.isBefore(limit)?expiresAt:limit;
    }
    private boolean unansweredEmail() {return "EMAIL".equals(inviteType)&&revokedAt==null&&useCount==0;}
    /** 만료는 공유 링크와 아직 응답하지 않은 이메일 초대에만 적용한다. 수락·거절·취소된 이메일 초대는 상태로 판정한다. */
    public boolean expired(Instant now) {
        if(email()&&!unansweredEmail())return false;
        return !effectiveExpiresAt().isAfter(now);
    }
    public boolean pendingEmail() {return unansweredEmail()&&!expired(Instant.now());}
    /** 대기 중 이메일 초대와 공유 링크만 만료 시각을 공개한다. 완료된 이메일 초대는 null이다. */
    public Instant publicExpiresAt() {return email()&&!"EMAIL".equals(inviteType)?null:effectiveExpiresAt();}
    public String status() {
        return switch(inviteType) {
            case "EMAIL_ACCEPTED" -> "ACCEPTED";
            case "EMAIL_DECLINED" -> "DECLINED";
            case "EMAIL_CANCELLED" -> "CANCELLED";
            case "EMAIL_FAILED" -> "DELIVERY_FAILED";
            default -> revokedAt!=null?"CANCELLED":(expired(Instant.now())?"EXPIRED":"PENDING");
        };
    }
    public void acceptedEmail(Instant now) {if(pendingEmail()){inviteType="EMAIL_ACCEPTED";useCount=1;retentionUntil=now.plusSeconds(SharingPolicy.EMAIL_INVITE_TTL_SECONDS);}}
    public void cancel(Instant now) {revokedAt=now;if(email()){inviteType="EMAIL_CANCELLED";retentionUntil=now.plusSeconds(SharingPolicy.EMAIL_INVITE_TTL_SECONDS);}}
    public void decline(Instant now) {revokedAt=now;inviteType="EMAIL_DECLINED";retentionUntil=now.plusSeconds(SharingPolicy.EMAIL_INVITE_TTL_SECONDS);}
    public void initializeHash(byte[] hash) {tokenHash=hash.clone();}
    public void used() {useCount++;}
}
