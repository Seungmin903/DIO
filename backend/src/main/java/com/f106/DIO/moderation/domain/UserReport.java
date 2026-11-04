package com.f106.DIO.moderation.domain;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="user_reports",uniqueConstraints=@UniqueConstraint(columnNames={"reporterUserId","clientRequestId"})) @lombok.Getter
public class UserReport {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long reportId;
 @Column(nullable=false) private Long reporterUserId;
 @Column(nullable=false) private Long reportedUserId;
 @Column(nullable=false) private UUID diaryId;
 @Column(nullable=false) private UUID clientRequestId;
 @Column(nullable=false,length=64) private String requestHash;
 @Enumerated(EnumType.STRING) @Column(nullable=false,length=40) private ReportReason reasonCode;
 @Column(length=1000) private String description;
 @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") private String evidenceJson="[]";
 @Column(nullable=false,length=20) private String status="RECEIVED";
 @Column(length=30) private String actionType;
 private Instant actionExpiresAt;
 @Column(columnDefinition="text") private String resolutionNote;
 @Column(length=100) private String handledBy;
 @Column(nullable=false) private Instant createdAt;
 @Column(nullable=false) private Instant updatedAt;
 private Instant resolvedAt;
 @Column(nullable=false,length=20) private String notificationStatus="PENDING";
 @Column(nullable=false) private int notificationAttempts;
 private Instant notificationNextAttemptAt;
 @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") private String historyJson="[]";
 protected UserReport(){}
 public UserReport(long actor,long target,UUID diary,UUID request,String hash,ReportReason reason,String description,String evidence){
  reporterUserId=actor;reportedUserId=target;diaryId=diary;clientRequestId=request;requestHash=hash;reasonCode=reason;this.description=description;evidenceJson=evidence;
  createdAt=updatedAt=notificationNextAttemptAt=Instant.now();
 }
 public void notificationSent(){notificationStatus="SENT";notificationAttempts++;notificationNextAttemptAt=null;updatedAt=Instant.now();}
 public void notificationReserved(Instant until){notificationStatus="SENDING";notificationNextAttemptAt=until;updatedAt=Instant.now();}
 public void notificationFailed(){notificationStatus="FAILED";notificationAttempts++;notificationNextAttemptAt=Instant.now().plusSeconds(Math.min(3600,60L << Math.min(notificationAttempts,5)));updatedAt=Instant.now();}
 public void startReview(String operator,String history){if(!"RECEIVED".equals(status))throw new IllegalStateException("Only received reports can start review");if(operator==null||operator.isBlank())throw new IllegalArgumentException("Operator required");status="REVIEWING";handledBy=operator;historyJson=history;resolvedAt=null;updatedAt=Instant.now();}
 /** Operations-only domain method. No public controller permits report processing or sanctions. */
 public void resolve(boolean violation,String action,Instant expires,String note,String operator,String history){
  if(!"REVIEWING".equals(status))throw new IllegalStateException("Only reviewing reports can be resolved");if(note==null||note.isBlank()||operator==null||operator.isBlank())throw new IllegalArgumentException("Resolution requires operator and reason");
  status=violation?"RESOLVED":"DISMISSED";actionType=action;actionExpiresAt=expires;resolutionNote=note;handledBy=operator;historyJson=history;resolvedAt=updatedAt=Instant.now();
 }
}
