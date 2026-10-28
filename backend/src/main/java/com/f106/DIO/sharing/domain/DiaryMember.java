package com.f106.DIO.sharing.domain;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="diary_members") @IdClass(DiaryMemberId.class) @lombok.Getter
public class DiaryMember {
    @Id private UUID diaryId;
    @Id private Long userId;
    @Column(nullable=false,length=20) private String role;
    @Column(nullable=false,columnDefinition="char(7)") @JdbcTypeCode(SqlTypes.CHAR) private String memberColor;
    @Column(name="is_favorite",nullable=false) private boolean favorite;
    private UUID lastOpenedPageId;
    private Instant lastOpenedAt;
    @Column(nullable=false) private Instant joinedAt;
    private Instant leftAt;
    @Column(length=30) private String memberNickname;
    private UUID memberProfilePhotoId;
    protected DiaryMember() {}
    public DiaryMember(UUID diaryId,Long userId,String role,String color,Instant now) {
        this.diaryId=diaryId;this.userId=userId;this.role=role;memberColor=color;joinedAt=now;
    }
    public boolean active() {return leftAt==null;}
    public boolean supportedRole() {return "OWNER".equals(role)||"EDITOR".equals(role);}
    public void leave(Instant now) {leftAt=now;role="EDITOR";}
    public void demote() {role="EDITOR";}
    public void changeProfile(boolean nicknameProvided,String nickname,boolean photoProvided,UUID photoId) {
        if(nicknameProvided)memberNickname=nickname;
        if(photoProvided)memberProfilePhotoId=photoId;
    }
    public void promote() {role="OWNER";}
    public void rejoin(Instant now) {leftAt=null;role="EDITOR";joinedAt=now;}
    public void update(Boolean favorite,UUID page,Instant now) {
        if(favorite!=null)this.favorite=favorite;
        if(page!=null){lastOpenedPageId=page;lastOpenedAt=now;}
    }
}
