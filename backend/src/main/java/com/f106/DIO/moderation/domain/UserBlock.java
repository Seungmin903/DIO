package com.f106.DIO.moderation.domain;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="user_blocks") @IdClass(UserBlockId.class) @lombok.Getter
public class UserBlock {
 @Id private Long blockerUserId;
 @Id private Long blockedUserId;
 @Column(nullable=false) private Instant createdAt;
 protected UserBlock(){}
 public UserBlock(long actor,long target){blockerUserId=actor;blockedUserId=target;createdAt=Instant.now();}
}
