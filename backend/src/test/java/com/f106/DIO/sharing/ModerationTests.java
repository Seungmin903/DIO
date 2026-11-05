package com.f106.DIO.sharing;
import com.f106.DIO.moderation.service.*;
import com.f106.DIO.moderation.repository.*;
import com.f106.DIO.moderation.dto.*;
import com.f106.DIO.moderation.domain.*;
import com.f106.DIO.moderation.exception.ModerationException;
import com.f106.DIO.media.storage.MediaStorage;
import com.f106.DIO.sharing.dto.EmailInviteRequest;
import com.f106.DIO.sharing.service.EmailInviteService;
import com.f106.DIO.sharing.exception.SharingException;
import org.junit.jupiter.api.Test;import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.http.MediaType;
import java.util.*;import java.time.Instant;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@TestPropertySource(properties={"spring.datasource.url=jdbc:h2:mem:moderation-tests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1","dio.media.local-directory=build/test-report-media","dio.signup.mail-from=notifications@dio.test","dio.moderation.report-mail.to=ops@dio.test"})
class ModerationTests extends SharingTestSupport {
 @Autowired BlockService blocks;@Autowired ReportService reports;@Autowired UserReportRepository reportRows;
 @Autowired UserBlockRepository blockRows;@Autowired EmailInviteService emails;@Autowired ReportMailDelivery delivery;
 @org.springframework.test.context.bean.override.mockito.MockitoSpyBean MediaStorage evidenceStorage;
 record Pair(Actor a,Actor b,UUID diary){}
 Pair pair(){var a=actor();var b=actor();var diary=diary(a);links.accept(links.create(diary,a.id()).token(),b.id());return new Pair(a,b,diary);}
 ReportRequest request(Pair p){return new ReportRequest(p.b.id(),p.diary,ReportReason.HARASSMENT,"설명",UUID.randomUUID());}
 @Test void newEndpointsRequireAuthentication()throws Exception{
  for(boolean invalidToken:List.of(false,true)){
   var requests=List.of(get("/api/v1/me/blocks"),put("/api/v1/me/blocks/1").contentType(MediaType.APPLICATION_JSON).content("{}"),delete("/api/v1/me/blocks/1"),multipart("/api/v1/reports"));
   for(var request:requests){
    if(invalidToken)request.header("Authorization","Bearer invalid.jwt.token");
    mvc.perform(request).andExpect(status().isUnauthorized()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
      .andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("WWW-Authenticate","Bearer"))
      .andExpect(jsonPath("code").value("INVALID_TOKEN")).andExpect(jsonPath("status").value(401));
   }
  }
 }
 @Autowired List<org.springframework.security.web.SecurityFilterChain> securityChains;
 @Autowired @org.springframework.beans.factory.annotation.Qualifier("moderationSecurity") org.springframework.security.web.SecurityFilterChain moderationChain;
 @Test void moderationRoutesMatchTheirOwnSecurityChainBeforeAnyOtherChain(){
  for(String[] route:new String[][]{{"GET","/api/v1/me/blocks"},{"PUT","/api/v1/me/blocks/1"},{"DELETE","/api/v1/me/blocks/1"},{"POST","/api/v1/reports"}}){
   var request=new org.springframework.mock.web.MockHttpServletRequest(route[0],route[1]);request.setServletPath(route[1]);
   assertThat(securityChains.stream().filter(chain->chain.matches(request)).findFirst()).hasValue(moderationChain);
  }
 }
 @Test void blockingPreservesMembershipAndOnlyExposesMyDirection()throws Exception{
  var p=pair();blocks.block(p.a.id(),p.b.id(),p.diary);blocks.block(p.a.id(),p.b.id(),p.diary);
  assertThat(membership.list(p.diary,p.a.id()).members()).filteredOn(v->v.userId().equals(""+p.b.id())).allMatch(v->v.blockedByMe());
  assertThat(membership.list(p.diary,p.b.id()).members()).allMatch(v->!v.blockedByMe());
  assertThat(membership.list(p.diary,p.b.id()).currentMembers()).isEqualTo(2);
  mvc.perform(get("/api/v1/me/blocks").header("Authorization","Bearer "+p.a.token())).andExpect(status().isOk()).andExpect(jsonPath("items[0].userId").value(p.b.id()));
  blocks.unblock(p.a.id(),p.b.id());blocks.unblock(p.a.id(),p.b.id());assertThat(blocks.between(p.a.id(),p.b.id())).isFalse();
 }
 @Test void selfAndOutsiderBlockRejected(){var p=pair();assertThatThrownBy(()->blocks.block(p.a.id(),p.a.id(),p.diary)).isInstanceOf(ModerationException.class);var other=actor();assertThatThrownBy(()->blocks.block(p.a.id(),other.id(),p.diary)).isInstanceOf(ModerationException.class);}
 @Test void blockCanBeRemovedAfterLeavingAndAfterTargetWithdrawal(){var p=pair();blocks.block(p.a.id(),p.b.id(),p.diary);membership.remove(p.diary,p.b.id(),p.b.id());var target=users.findById(p.b.id()).orElseThrow();target.withdraw(Instant.now());users.saveAndFlush(target);assertThat(blocks.list(p.a.id(),0,20).items().get(0).nickname()).isEqualTo("탈퇴한 사용자");blocks.unblock(p.a.id(),p.b.id());}
 @Test void linkJoiningRequiresOnlyMyAcknowledgementAndNeverRejectsReverseBlock(){
  var p=pair();blocks.block(p.a.id(),p.b.id(),p.diary);membership.remove(p.diary,p.b.id(),p.b.id());
  var token=links.create(p.diary,p.a.id()).token();links.accept(token,p.b.id()); // Owner blocked entrant: entry still allowed.
  blocks.block(p.b.id(),p.a.id(),p.diary);membership.remove(p.diary,p.b.id(),p.b.id());
  assertThat(links.preview(token,p.b.id()).requiresBlockedMemberConfirmation()).isTrue();
  assertThat(links.preview(token).requiresBlockedMemberConfirmation()).isFalse();
  assertThatThrownBy(()->links.accept(token,p.b.id())).isInstanceOfSatisfying(SharingException.class,e->assertThat(e.code).isEqualTo("BLOCKED_MEMBER_CONFIRMATION_REQUIRED"));
  assertThat(links.accept(token,p.b.id(),true).alreadyMember()).isFalse();
  assertThat(links.preview(token,p.b.id()).requiresBlockedMemberConfirmation()).isFalse();
  assertThat(links.accept(token,p.b.id()).alreadyMember()).isTrue();
 }
 @Test void existingOwnerAndEditorPreviewDoNotRequireBlockedMemberAcknowledgement()throws Exception{
  var p=pair();blocks.block(p.a.id(),p.b.id(),p.diary);blocks.block(p.b.id(),p.a.id(),p.diary);
  var token=links.create(p.diary,p.a.id()).token();
  for(var member:List.of(p.a,p.b)){
   mvc.perform(get("/api/v1/invites/"+token).header("Authorization","Bearer "+member.token()))
    .andExpect(status().isOk()).andExpect(jsonPath("requiresBlockedMemberConfirmation").value(false));
   var accepted=links.accept(token,member.id());assertThat(accepted.alreadyMember()).isTrue();
   assertThat(accepted.currentMembers()).isEqualTo(2);
  }
 }
 @Test void legacyOwnerPreviewSkipsWarningWithoutWritingMembership(){
  var p=pair();blocks.block(p.a.id(),p.b.id(),p.diary);var token=links.create(p.diary,p.a.id()).token();
  var ownerKey=new com.f106.DIO.diary.domain.DiaryMemberId(p.diary,p.a.id());members.deleteById(ownerKey);members.flush();
  assertThat(links.preview(token,p.a.id()).requiresBlockedMemberConfirmation()).isFalse();
  assertThat(members.findById(ownerKey)).isEmpty();
 }
 @Test void emailSendSuppressedAndPendingAcceptanceBlockedUntilUnblocked(){
  var p=pair();var other=diary(p.a);String email=users.findById(p.b.id()).orElseThrow().getEmail();
  emails.send(other,p.a.id(),new EmailInviteRequest(email));var pending=invites.pendingEmail(other,p.b.id()).orElseThrow();String token=tokenSigner.token(pending);
  blocks.block(p.b.id(),p.a.id(),p.diary);
  assertThatThrownBy(()->links.accept(token,p.b.id(),true)).isInstanceOfSatisfying(SharingException.class,e->assertThat(e.code).isEqualTo("INVITE_UNAVAILABLE"));
  var third=diary(p.a);emails.send(third,p.a.id(),new EmailInviteRequest(email));assertThat(invites.pendingEmail(third,p.b.id())).isEmpty();
  blocks.unblock(p.b.id(),p.a.id());assertThat(links.accept(token,p.b.id()).alreadyMember()).isFalse();
 }
 @Test void reportWithoutEvidenceIsIdempotentAndDoesNotBlock(){var p=pair();var r=request(p);var first=reports.submit(p.a.id(),r,List.of());assertThat(first.created()).isTrue();var again=reports.submit(p.a.id(),r,List.of());assertThat(again.created()).isFalse();assertThat(again.response().reportId()).isEqualTo(first.response().reportId());assertThat(blocks.between(p.a.id(),p.b.id())).isFalse();assertThat(reportRows.findById(first.response().reportId()).orElseThrow().getEvidenceJson()).isEqualTo("[]");}
 @Test void differentContentWithSameRequestIdConflicts(){var p=pair();var r=request(p);reports.submit(p.a.id(),r,List.of());assertThatThrownBy(()->reports.submit(p.a.id(),new ReportRequest(r.reportedUserId(),r.diaryId(),r.reasonCode(),"다름",r.clientRequestId()),List.of())).isInstanceOfSatisfying(ModerationException.class,e->assertThat(e.code).isEqualTo("REPORT_REQUEST_CONFLICT"));}
 @Test void otherRequiresDescriptionAndSelfReportRejected(){var p=pair();assertThatThrownBy(()->reports.submit(p.a.id(),new ReportRequest(p.b.id(),p.diary,ReportReason.OTHER,"  ",UUID.randomUUID()),List.of())).isInstanceOf(ModerationException.class);assertThatThrownBy(()->reports.submit(p.a.id(),new ReportRequest(p.a.id(),p.diary,ReportReason.HARASSMENT,null,UUID.randomUUID()),List.of())).isInstanceOf(ModerationException.class);}
 @Test void reportRejectsOutsider(){var p=pair();var other=actor();assertThatThrownBy(()->reports.submit(other.id(),request(p),List.of())).isInstanceOf(SharingException.class);}
 @Test void multipartContractAndValidation()throws Exception{
  var p=pair();String body="{\"reportedUserId\":"+p.b.id()+",\"diaryId\":\""+p.diary+"\",\"reasonCode\":\"HARASSMENT\",\"clientRequestId\":\""+UUID.randomUUID()+"\"}";
  mvc.perform(multipart("/api/v1/reports").file(new MockMultipartFile("report","","application/json",body.getBytes(java.nio.charset.StandardCharsets.UTF_8))).header("Authorization","Bearer "+p.a.token())).andExpect(status().isCreated()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("status").value("RECEIVED"));
  mvc.perform(multipart("/api/v1/reports").file(new MockMultipartFile("report","","application/json","{}".getBytes())).header("Authorization","Bearer "+p.a.token())).andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control","no-store"));
 }
 @Test void evidenceValidatesActualImageNotMimeAndIsPrivate()throws Exception{
  when(evidenceStorage.provider()).thenReturn("LOCAL");var p=pair();var out=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(8,8,java.awt.image.BufferedImage.TYPE_INT_RGB),"png",out);
  var file=new MockMultipartFile("evidenceFiles","private.png","image/png",out.toByteArray());var result=reports.submit(p.a.id(),request(p),List.of(file));
  var row=reportRows.findById(result.response().reportId()).orElseThrow();assertThat(row.getEvidenceJson()).contains("storageKey").doesNotContain("http","private.png");verify(evidenceStorage).put(anyString(),any(),eq("image/png"));
  var forged=new MockMultipartFile("evidenceFiles","x.png","image/png","not image".getBytes());assertThatThrownBy(()->reports.submit(p.a.id(),request(p),List.of(forged))).isInstanceOfSatisfying(ModerationException.class,e->assertThat(e.code).isEqualTo("REPORT_EVIDENCE_UNSUPPORTED"));
 }
 @Test void evidenceCountAndSizeLimited(){var p=pair();var empty=new MockMultipartFile("evidenceFiles",new byte[0]);assertThatThrownBy(()->reports.submit(p.a.id(),request(p),List.of(empty,empty,empty,empty))).isInstanceOf(ModerationException.class);var large=new MockMultipartFile("evidenceFiles",new byte[5*1024*1024+1]);assertThatThrownBy(()->reports.submit(p.a.id(),request(p),List.of(large))).isInstanceOfSatisfying(ModerationException.class,e->assertThat(e.code).isEqualTo("REPORT_EVIDENCE_TOO_LARGE"));}
 @Test void failedMailKeepsReportAndCanRetryWithoutLeakingContent(){
  var p=pair();var r=reports.submit(p.a.id(),request(p),List.of());doThrow(new org.springframework.mail.MailSendException("test")).when(smtp).send(any(org.springframework.mail.SimpleMailMessage.class));
  delivery.deliver(r.response().reportId());var saved=reportRows.findById(r.response().reportId()).orElseThrow();assertThat(saved.getStatus()).isEqualTo("RECEIVED");assertThat(saved.getNotificationStatus()).isEqualTo("FAILED");assertThat(saved.getNotificationNextAttemptAt()).isAfter(Instant.now());
  reset(smtp);jdbc.update("update user_reports set notification_next_attempt_at=? where report_id=?",Instant.now().minusSeconds(1),saved.getReportId());delivery.deliver(saved.getReportId());delivery.deliver(saved.getReportId());
  var message=org.mockito.ArgumentCaptor.forClass(org.springframework.mail.SimpleMailMessage.class);verify(smtp,times(1)).send(message.capture());assertThat(message.getValue().getText()).doesNotContain("설명","@example.com","storageKey");assertThat(reportRows.findById(saved.getReportId()).orElseThrow().getNotificationStatus()).isEqualTo("SENT");
 }
 @Autowired ReportReviewService review;
 @Test void reviewRecordsDecisionHistoryWithoutAutomaticallySuspendingUser(){var p=pair();var r=reports.submit(p.a.id(),request(p),List.of());review.review(r.response().reportId(),"operator","사실 확인");review.resolve(r.response().reportId(),true,"WARNING",null,"경미한 첫 위반","operator");var row=reportRows.findById(r.response().reportId()).orElseThrow();assertThat(row.getStatus()).isEqualTo("RESOLVED");assertThat(row.getHistoryJson()).contains("REVIEWING","RESOLVED","WARNING");assertThat(users.findById(p.b.id()).orElseThrow().isActive()).isTrue();}
 @Test void terminalReportCannotBeReopenedOrResolvedAgain(){var p=pair();var r=reports.submit(p.a.id(),request(p),List.of());review.review(r.response().reportId(),"operator","사실 확인");review.resolve(r.response().reportId(),false,"NONE",null,"위반 없음","operator");assertThatThrownBy(()->review.review(r.response().reportId(),"operator","재검토")).isInstanceOf(IllegalStateException.class);assertThatThrownBy(()->review.resolve(r.response().reportId(),false,"NONE",null,"재처리","operator")).isInstanceOf(IllegalStateException.class);}
 @Test void concurrentIdenticalReportsCreateExactlyOneRow()throws Exception{
  var p=pair();var request=request(p);var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
  try{var gate=new java.util.concurrent.CountDownLatch(1);var a=pool.submit(()->{gate.await();return reports.submit(p.a.id(),request,List.of());});var b=pool.submit(()->{gate.await();return reports.submit(p.a.id(),request,List.of());});gate.countDown();var first=a.get(15,java.util.concurrent.TimeUnit.SECONDS);var second=b.get(15,java.util.concurrent.TimeUnit.SECONDS);assertThat(first.response().reportId()).isEqualTo(second.response().reportId());assertThat(first.created()).isNotEqualTo(second.created());}finally{pool.shutdownNow();}
 }
 @Test void storedEvidenceIsRemovedOnDatabaseRollback()throws Exception{
  var p=pair();var out=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB),"png",out);
  doThrow(new IllegalStateException("storage unavailable")).when(evidenceStorage).put(anyString(),any(),anyString());
  assertThatThrownBy(()->reports.submit(p.a.id(),request(p),List.of(new MockMultipartFile("evidenceFiles","x.png","image/png",out.toByteArray())))).isInstanceOf(IllegalStateException.class);
  verify(evidenceStorage).delete(anyString());
 }

 @Test void frontendStringUserIdsAndBlockHttpContract()throws Exception{
  var p=pair();var authorization="Bearer "+p.a.token();
  mvc.perform(put("/api/v1/me/blocks/"+p.b.id()).header("Authorization",authorization).contentType(MediaType.APPLICATION_JSON).content("{\"diaryId\":\""+p.diary+"\"}"))
    .andExpect(status().isNoContent()).andExpect(header().string("Cache-Control","no-store"));
  mvc.perform(delete("/api/v1/me/blocks/"+p.b.id()).header("Authorization",authorization)).andExpect(status().isNoContent());
  String body="{\"reportedUserId\":\""+p.b.id()+"\",\"diaryId\":\""+p.diary+"\",\"reasonCode\":\"HARASSMENT\",\"description\":null,\"clientRequestId\":\""+UUID.randomUUID()+"\"}";
  mvc.perform(multipart("/api/v1/reports").file(new MockMultipartFile("report","report.json","application/json",body.getBytes(java.nio.charset.StandardCharsets.UTF_8))).header("Authorization",authorization))
    .andExpect(status().isCreated()).andExpect(jsonPath("status").value("RECEIVED"));
 }

 @Test void frontendCorsPreflightAcceptsConfiguredOriginAndNoStoreHeader()throws Exception{
  for(String[] route:new String[][]{{"/api/v1/reports","POST"},{"/api/v1/me/blocks","GET"},{"/api/v1/me/blocks/25","PUT"},{"/api/v1/me/blocks/25","DELETE"}}){
   mvc.perform(options(route[0]).header("Origin","http://localhost:8081").header("Access-Control-Request-Method",route[1])
     .header("Access-Control-Request-Headers","authorization,content-type,cache-control,x-dio-access-token"))
     .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:8081"));
  }
  mvc.perform(options("/api/v1/reports").header("Origin","https://untrusted.example").header("Access-Control-Request-Method","POST"))
    .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
 }

 @Test void reportQuotaRejectsBeforeImageDecodingAndPreservesIdempotentReplay()throws Exception{
  var p=pair();var original=request(p);var accepted=reports.submit(p.a.id(),original,List.of());
  reports.submit(p.a.id(),request(p),List.of());reports.submit(p.a.id(),request(p),List.of());
  assertThat(reports.submit(p.a.id(),original,List.of()).response().reportId()).isEqualTo(accepted.response().reportId());
  var next=request(p);String body=new tools.jackson.databind.ObjectMapper().writeValueAsString(next);
  mvc.perform(multipart("/api/v1/reports").file(new MockMultipartFile("report","","application/json",body.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
    .file(new MockMultipartFile("evidenceFiles","invalid.png","image/png","not an image".getBytes())).header("Authorization","Bearer "+p.a.token()))
    .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After")).andExpect(header().string("Cache-Control","no-store"))
    .andExpect(jsonPath("code").value("REPORT_RATE_LIMITED"));
 }
 @Test void concurrentReportsCannotExceedTargetQuota()throws Exception{
  var p=pair();reports.submit(p.a.id(),request(p),List.of());reports.submit(p.a.id(),request(p),List.of());
  var pool=java.util.concurrent.Executors.newFixedThreadPool(2);var start=new java.util.concurrent.CountDownLatch(1);
  java.util.concurrent.Callable<String> task=()->{start.await();try{reports.submit(p.a.id(),request(p),List.of());return "CREATED";}catch(ModerationException e){return e.code;}};
  try{var a=pool.submit(task);var b=pool.submit(task);start.countDown();assertThat(List.of(a.get(15,java.util.concurrent.TimeUnit.SECONDS),b.get(15,java.util.concurrent.TimeUnit.SECONDS))).containsExactlyInAnyOrder("CREATED","REPORT_RATE_LIMITED");}
  finally{pool.shutdownNow();}
 }


 @Test void noticeContainsNoReportDataAndPreservesDatabaseAndPrivateEvidence()throws Exception{
  var p=pair();var image=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB),"png",image);
  var request=request(p);var accepted=reports.submit(p.a.id(),request,List.of(new MockMultipartFile("evidenceFiles","proof.png","image/png",image.toByteArray())));long id=accepted.response().reportId();
  var before=reportRows.findById(id).orElseThrow();String metadata=before.getEvidenceJson();
  String key=new tools.jackson.databind.ObjectMapper().readTree(metadata).get(0).path("storageKey").asText();byte[] stored=evidenceStorage.read(key);
  clearInvocations(evidenceStorage);
  doThrow(com.f106.DIO.media.storage.MediaStorageException.unavailable()).when(evidenceStorage).read(anyString());
  delivery.deliver(id);delivery.deliver(id);
  var message=org.mockito.ArgumentCaptor.forClass(org.springframework.mail.SimpleMailMessage.class);verify(smtp,times(1)).send(message.capture());
  assertThat(message.getValue().getSubject()).isEqualTo("[DIO] 새 신고가 접수됐습니다");
  assertThat(message.getValue().getText()).isEqualTo("새 신고가 접수됐습니다.");
  verify(smtp,never()).createMimeMessage();verify(smtp,never()).send(any(jakarta.mail.internet.MimeMessage.class));
  verify(evidenceStorage,never()).read(anyString());verify(evidenceStorage,never()).put(anyString(),any(),anyString());verify(evidenceStorage,never()).delete(anyString());
  var after=reportRows.findById(id).orElseThrow();assertThat(after.getNotificationStatus()).isEqualTo("SENT");assertThat(after.getStatus()).isEqualTo("RECEIVED");
  assertThat(after.getReporterUserId()).isEqualTo(p.a.id());assertThat(after.getReportedUserId()).isEqualTo(p.b.id());
  assertThat(after.getReasonCode()).isEqualTo(request.reasonCode());assertThat(after.getDescription()).isEqualTo(request.description());
  assertThat(after.getEvidenceJson()).isEqualTo(metadata);assertThat(after.getDiaryId()).isEqualTo(p.diary);
  doCallRealMethod().when(evidenceStorage).read(anyString());assertThat(evidenceStorage.read(key)).isEqualTo(stored);
 }


}
