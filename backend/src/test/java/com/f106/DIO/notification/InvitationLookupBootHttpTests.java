package com.f106.DIO.notification;

import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.dto.LoginResponse;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import static org.assertj.core.api.Assertions.*;

@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="DIO_LOOKUP_PG",matches="true")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class InvitationLookupBootHttpTests {
 @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
  r.add("spring.datasource.url",()->System.getenv("DIO_LOOKUP_PG_URL"));
  r.add("spring.datasource.username",()->"postgres");
  r.add("spring.datasource.password",()->System.getenv("DIO_LOOKUP_PG_PASSWORD"));
  r.add("spring.jpa.hibernate.ddl-auto",()->"none");
  r.add("spring.flyway.enabled",()->true);
  r.add("dio.push.outbox.enabled",()->true);
  r.add("dio.push.environment",()->"development");
  r.add("dio.push.encryption-key",()->Base64.getEncoder().encodeToString(new byte[32]));
  r.add("dio.push.outbox.ttl-seconds",()->3600);
  r.add("SHARING_INVITE_SECRET",()->Base64.getEncoder().encodeToString(new byte[32]));
  r.add("SHARING_INVITE_BASE_URL",()->"https://example.test/invite/");
  r.add("dio.auth.jwt-secret",()->Base64.getEncoder().encodeToString(new byte[32]));
 }
 @LocalServerPort int port;
 @Autowired JdbcTemplate jdbc;
 @Autowired UserRepository users;
 @Autowired EmailAuthProviderRepository accounts;
 @Autowired org.springframework.context.ApplicationContext context;
 @Autowired com.f106.DIO.sharing.service.EmailInviteService emails;
 @Autowired com.f106.DIO.notification.event.InvitationNotificationHandler handler;
 @Autowired com.f106.DIO.push.service.PushInstallationService installations;
 @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
 final HttpClient client=HttpClient.newHttpClient();
 final tools.jackson.databind.json.JsonMapper json=tools.jackson.databind.json.JsonMapper.builder().build();
 @Test void outboxAndInstallationShareConfiguredScope() {
  assertThat(org.springframework.test.util.ReflectionTestUtils.getField(handler,"pushEnvironment")).isEqualTo(org.springframework.test.util.ReflectionTestUtils.getField(installations,"environment")).isEqualTo("development");
  assertThat(org.springframework.test.util.ReflectionTestUtils.getField(handler,"pushAppId")).isEqualTo(org.springframework.test.util.ReflectionTestUtils.getField(installations,"appId")).isEqualTo("dio");
 }
    long user(String email, String name) {
        var user = users.saveAndFlush(new User(email, name, Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(), email,
            new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4).encode("DioMember123!"), Instant.now()));
        return user.getUserId();
    }
    HttpResponse<String> request(String method, String path, String token, String body, String... headers) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        for (int i=0; i<headers.length; i+=2) builder.header(headers[i], headers[i+1]);
        return client.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    LoginResponse login(String email) throws Exception {
        var response = request("POST", "/api/v1/auth/login", null, "{\"email\":\""+email+"\",\"password\":\"DioMember123!\"}");
        assertThat(response.statusCode()).isEqualTo(200);
        return json.readValue(response.body(), LoginResponse.class);
    }

 @Test void automaticScanRealLoginAndSessionRevocation() throws Exception {
  assertThat(context.getBeansOfType(com.f106.DIO.notification.invitation.InvitationLookup.class)).hasSize(1);
  long recipient=user("lookup-r@example.com","lookup-r"), actor=user("lookup-a@example.com","lookup-a");
  UUID diary=UUID.randomUUID();
  jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'boot lookup')",diary,actor);
  Long invite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at) values(?,?,?,'EMAIL',?,?) returning invite_id",Long.class,diary,actor,recipient,new byte[32],java.sql.Timestamp.from(Instant.now().minusSeconds(3600)));
  jdbc.update("insert into notifications(user_id,diary_id,notification_type,payload_json) values(?,?,'DIARY_INVITE',cast(? as jsonb))",recipient,diary,"{\"inviteId\":\""+invite+"\"}");
  var session=login("lookup-r@example.com"); var other=login("lookup-a@example.com");
  var response=request("GET","/api/v1/notifications",session.accessToken(),null);
  assertThat(response.statusCode()).isEqualTo(200);
  var target=json.readTree(response.body()).path("items").get(0).path("invitation");
  assertThat(target.path("inviteId").asText()).isEqualTo(invite.toString());
  assertThat(target.path("canOpen").asBoolean()).isTrue();
  assertThat(json.readTree(request("GET","/api/v1/notifications",other.accessToken(),null).body()).path("items").size()).isZero();
  assertThat(request("GET","/api/v1/notifications",null,null,"X-User-Id",Long.toString(recipient)).statusCode()).isEqualTo(401);
  assertThat(request("GET","/api/v1/notifications",session.accessToken()+"x",null).statusCode()).isEqualTo(401);
  jdbc.update("update diary_invites set invite_type='EMAIL_CANCELLED' where invite_id=?",invite);
  assertThat(json.readTree(request("GET","/api/v1/notifications",session.accessToken(),null).body()).path("items").get(0).path("invitation").path("canOpen").asBoolean()).isFalse();
  assertThat(request("POST","/api/v1/auth/logout",session.accessToken(),null).statusCode()).isEqualTo(204);
  assertThat(request("GET","/api/v1/notifications",session.accessToken(),null).statusCode()).isEqualTo(401);
 }

 @Test void emailInviteHttpShowsActionableCountAndCancelClearsIt() throws Exception {
  long recipient=user("dot-recipient@example.com","dot-recipient"), actor=user("dot-actor@example.com","dot-actor");
  UUID diary=UUID.randomUUID();
  jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'dot qa')",diary,actor);
  var a=login("dot-actor@example.com"); var r=login("dot-recipient@example.com");
  var sent=request("POST","/api/v1/diaries/"+diary+"/invites/email",a.accessToken(),"{\"email\":\"dot-recipient@example.com\"}");
  assertThat(sent.statusCode()).isEqualTo(202);
  long invite=jdbc.queryForObject("select invite_id from diary_invites where diary_id=?",Long.class,diary);
  var first=json.readTree(request("GET","/api/v1/notifications/unread-count",r.accessToken(),null).body());
  assertThat(first.path("unreadCount").asLong()).isEqualTo(1);
  assertThat(first.path("actionableUnreadCount").asLong()).isEqualTo(1);
  String payload="{\"inviteId\":\""+invite+"\"}";
  jdbc.update("insert into notifications(user_id,diary_id,notification_type,payload_json) select ?,?,'DIARY_INVITE',cast(? as jsonb) from generate_series(1,999)",recipient,diary,payload);
  long[] ms=new long[3];for(int i=0;i<3;i++){long start=System.nanoTime();var count=request("GET","/api/v1/notifications/unread-count",r.accessToken(),null);ms[i]=(System.nanoTime()-start)/1_000_000;assertThat(json.readTree(count.body()).path("actionableUnreadCount").asLong()).isEqualTo(1000);}
  System.out.println("DOT_COUNT_BENCH_1000_MS="+java.util.Arrays.toString(ms));
  assertThat(request("DELETE","/api/v1/diaries/"+diary+"/invites/"+invite,a.accessToken(),null).statusCode()).isEqualTo(204);
  var cancelled=json.readTree(request("GET","/api/v1/notifications/unread-count",r.accessToken(),null).body());
  assertThat(cancelled.path("unreadCount").asLong()).isEqualTo(1000);
  assertThat(cancelled.path("actionableUnreadCount").asLong()).isZero();
 }

 @Test void producerCreatesAtomicallyAndReplayDoesNotDuplicate() throws Exception {
  long recipient=user("event-r@example.com","event-r"), actor=user("event-a@example.com","event-a");
  UUID diary=UUID.randomUUID();
  jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'producer QA')",diary,actor);
  emails.send(diary,actor,new com.f106.DIO.sharing.dto.EmailInviteRequest("event-r@example.com"));
  long invite=jdbc.queryForObject("select invite_id from diary_invites where diary_id=?",Long.class,diary);
  var at=jdbc.queryForObject("select created_at from diary_invites where invite_id=?",java.sql.Timestamp.class,invite).toInstant();
  assertThat(jdbc.queryForObject("select count(*) from notifications where user_id=?",Long.class,recipient)).isEqualTo(1);
  assertThat(jdbc.queryForObject("select count(*) from invitation_notification_receipts where invite_id=?",Long.class,invite)).isEqualTo(1);
  assertThat(jdbc.queryForObject("select count(*) from push_outbox where recipient_user_id=? and notification_id is not null",Long.class,recipient)).isEqualTo(1);
  var tx=new org.springframework.transaction.support.TransactionTemplate(transactions);
  var event=new com.f106.DIO.notification.event.InvitationConfirmedEvent(UUID.randomUUID(),invite,recipient,at);
  assertThat(tx.execute(status->handler.handle(event)).duplicate()).isTrue();
  assertThat(jdbc.queryForObject("select count(*) from notifications where user_id=?",Long.class,recipient)).isEqualTo(1);
  assertThatThrownBy(()->handler.handle(event)).isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
  UUID original=jdbc.queryForObject("select event_id from invitation_notification_receipts where invite_id=?",UUID.class,invite);
  assertThatThrownBy(()->tx.execute(status->handler.handle(new com.f106.DIO.notification.event.InvitationConfirmedEvent(original,invite,actor,at)))).isInstanceOf(com.f106.DIO.notification.event.InvitationEventException.class);
  long concurrent=user("event-c@example.com","event-c");
  long concurrentInvite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at) values(?,?,?,'EMAIL',?,?) returning invite_id",Long.class,diary,actor,concurrent,new byte[32],java.sql.Timestamp.valueOf("9999-12-31 23:59:59"));
  var created=jdbc.queryForObject("select created_at from diary_invites where invite_id=?",java.sql.Timestamp.class,concurrentInvite).toInstant();
  var pool=java.util.concurrent.Executors.newFixedThreadPool(4);
  try {
   var jobs=new java.util.ArrayList<java.util.concurrent.Future<?>>();
   for(int i=0;i<4;i++)jobs.add(pool.submit(()->tx.execute(status->handler.handle(new com.f106.DIO.notification.event.InvitationConfirmedEvent(UUID.randomUUID(),concurrentInvite,concurrent,created)))));
   for(var job:jobs)job.get(20,java.util.concurrent.TimeUnit.SECONDS);
   assertThat(jdbc.queryForObject("select count(*) from notifications where user_id=?",Long.class,concurrent)).isEqualTo(1);
   assertThat(jdbc.queryForObject("select count(*) from push_outbox where recipient_user_id=?",Long.class,concurrent)).isEqualTo(1);
  } finally {pool.shutdownNow();}
  long rollbackUser=user("event-rollback@example.com","event-rollback");
  long rollbackInvite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at) values(?,?,?,'EMAIL',?,?) returning invite_id",Long.class,diary,actor,rollbackUser,new byte[32],java.sql.Timestamp.valueOf("9999-12-31 23:59:59"));
  var rollbackAt=jdbc.queryForObject("select created_at from diary_invites where invite_id=?",java.sql.Timestamp.class,rollbackInvite).toInstant();
  tx.execute(status->{handler.handle(new com.f106.DIO.notification.event.InvitationConfirmedEvent(UUID.randomUUID(),rollbackInvite,rollbackUser,rollbackAt));status.setRollbackOnly();return null;});
  assertThat(jdbc.queryForObject("select count(*) from notifications where user_id=?",Long.class,rollbackUser)).isZero();
  assertThat(jdbc.queryForObject("select count(*) from push_outbox where recipient_user_id=?",Long.class,rollbackUser)).isZero();
  assertThat(jdbc.queryForObject("select count(*) from invitation_notification_receipts where recipient_user_id=?",Long.class,rollbackUser)).isZero();
  // 실제 생산자에서 알림 INSERT를 실패시켜 초대·이력까지 롤백되는지 확인한다.
  long failed=user("event-f@example.com","event-f");
  jdbc.execute("alter table notifications add constraint lookup_fail_recipient check(user_id<>"+failed+")");
  try {
   assertThatThrownBy(()->emails.send(diary,actor,new com.f106.DIO.sharing.dto.EmailInviteRequest("event-f@example.com"))).isInstanceOf(RuntimeException.class);
   assertThat(jdbc.queryForObject("select count(*) from diary_invites where invitee_user_id=?",Long.class,failed)).isZero();
   assertThat(jdbc.queryForObject("select count(*) from invitation_notification_receipts where recipient_user_id=?",Long.class,failed)).isZero();
  } finally {jdbc.execute("alter table notifications drop constraint lookup_fail_recipient");}
  jdbc.execute("alter table push_outbox add constraint lookup_fail_outbox check(recipient_user_id<>"+failed+")");
  try {
   assertThatThrownBy(()->emails.send(diary,actor,new com.f106.DIO.sharing.dto.EmailInviteRequest("event-f@example.com"))).isInstanceOf(RuntimeException.class);
   assertThat(jdbc.queryForObject("select count(*) from diary_invites where invitee_user_id=?",Long.class,failed)).isZero();
   assertThat(jdbc.queryForObject("select count(*) from notifications where user_id=?",Long.class,failed)).isZero();
   assertThat(jdbc.queryForObject("select count(*) from invitation_notification_receipts where recipient_user_id=?",Long.class,failed)).isZero();
   assertThat(jdbc.queryForObject("select count(*) from push_outbox where recipient_user_id=?",Long.class,failed)).isZero();
  } finally {jdbc.execute("alter table push_outbox drop constraint lookup_fail_outbox");}
  emails.send(diary,actor,new com.f106.DIO.sharing.dto.EmailInviteRequest("event-f@example.com"));
  assertThat(jdbc.queryForObject("select count(*) from notifications where user_id=?",Long.class,failed)).isEqualTo(1);
  assertThat(jdbc.queryForObject("select count(*) from push_outbox where recipient_user_id=?",Long.class,failed)).isEqualTo(1);
 }

 @Test void producerToWorkerUsesFakeGateway() throws Exception {
  long recipient=user("worker-r@example.com","worker-r"), actor=user("worker-a@example.com","worker-a");
  var session=login("worker-r@example.com");var jwt=context.getBean(LoginJwt.class).decode(session.accessToken());
  var devices=context.getBean(com.f106.DIO.push.service.PushInstallationService.class);UUID installation=UUID.randomUUID();
  var registration=devices.register(jwt,installation,UUID.randomUUID(),new com.f106.DIO.push.service.PushInstallationService.Input("EXPO","ANDROID","ExpoPushToken[boot]","GRANTED",true));
  assertThat(request("GET","/api/v1/push/installations/"+installation+"/binding",session.accessToken(),null,"X-DIO-Installation-Secret",registration.installationSecret()).statusCode()).isEqualTo(200);
  assertThat(request("GET","/api/v1/push/installations/"+installation+"/binding",session.accessToken(),null,"X-DIO-Installation-Secret","wrong").statusCode()).isEqualTo(404);
  UUID diary=UUID.randomUUID();jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'e2e push')",diary,actor);
  emails.send(diary,actor,new com.f106.DIO.sharing.dto.EmailInviteRequest("worker-r@example.com"));
  long invite=jdbc.queryForObject("select invite_id from diary_invites where diary_id=?",Long.class,diary);
  var gateway=org.mockito.Mockito.mock(com.f106.DIO.push.service.ExpoPushGateway.class);
  org.mockito.Mockito.when(gateway.sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(Long.toString(invite))))
   .thenReturn(new com.f106.DIO.push.service.ExpoPushGateway.Result(true,"fake-ticket",null));
  new com.f106.DIO.push.service.PushDeliveryWorker(jdbc,transactions,devices,gateway,true).poll();
  assertThat(jdbc.queryForObject("select count(*) from push_outbox o join push_deliveries d on d.outbox_id=o.outbox_id where o.recipient_user_id=? and d.status='SENT'",Long.class,recipient)).isEqualTo(1);
  org.mockito.Mockito.verify(gateway).sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(Long.toString(invite)));
 }

 @Test void cancellationRace() throws Exception { race("cancel"); }
 @Test void acceptanceRace() throws Exception { race("accept"); }
 @Test void deliveryFailureRace() throws Exception { race("failed"); }
 void race(String kind) throws Exception {
  long actor=user(kind+"-a@example.com",kind+"-a"), recipient=user(kind+"-r@example.com",kind+"-r");
  var tx=new org.springframework.transaction.support.TransactionTemplate(transactions);
  for(boolean stateFirst:new boolean[]{false,true}) {
   UUID diary=UUID.randomUUID();
   jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'race QA')",diary,actor);
   long invite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at) values(?,?,?,'EMAIL',?,?) returning invite_id",Long.class,diary,actor,recipient,new byte[32],java.sql.Timestamp.valueOf("9999-12-31 23:59:59"));
   var repo=context.getBean(com.f106.DIO.sharing.repository.DiaryInviteRepository.class);
   var tokenService=context.getBean(com.f106.DIO.sharing.support.InviteTokens.class);
   String token=tx.execute(st->{var value=repo.findById(invite).orElseThrow();String t=tokenService.token(value);value.initializeHash(tokenService.hash(t));return t;});
   var at=jdbc.queryForObject("select created_at from diary_invites where invite_id=?",java.sql.Timestamp.class,invite).toInstant();
   var event=new com.f106.DIO.notification.event.InvitationConfirmedEvent(UUID.randomUUID(),invite,recipient,at);
   Runnable mutate=()->{switch(kind){case "cancel"->emails.cancel(diary,actor,invite);case "accept"->context.getBean(com.f106.DIO.sharing.service.DiaryInviteService.class).accept(token,recipient);default->tx.executeWithoutResult(st->{jdbc.queryForObject("select diary_id from diaries where diary_id=? for update",UUID.class,diary);jdbc.update("update diary_invites set invite_type='EMAIL_FAILED',revoked_at=current_timestamp where invite_id=?",invite);});}};
   var pool=java.util.concurrent.Executors.newSingleThreadExecutor();
   var release=new java.util.concurrent.CountDownLatch(1);var locked=new java.util.concurrent.CountDownLatch(1);
   // Reproduce legacy delivery failure without a production SMTP dispatcher.
   if(stateFirst&&kind.equals("failed"))mutate.run();
   var holder=pool.submit(()->tx.execute(st->{
    if(stateFirst) {if(!kind.equals("failed"))mutate.run();jdbc.queryForObject("select diary_id from diaries where diary_id=? for update",UUID.class,diary);}
    else handler.handle(event);
    locked.countDown();try{if(!release.await(20,java.util.concurrent.TimeUnit.SECONDS))throw new AssertionError("release timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;
   }));
   assertThat(locked.await(20,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
   var waiter=java.util.concurrent.Executors.newSingleThreadExecutor();
   try {
    var next=waiter.submit(()->{if(stateFirst)tx.execute(st->handler.handle(event));else mutate.run();});
    assertThatThrownBy(()->next.get(300,java.util.concurrent.TimeUnit.MILLISECONDS)).isInstanceOf(java.util.concurrent.TimeoutException.class);
    release.countDown();holder.get(20,java.util.concurrent.TimeUnit.SECONDS);next.get(20,java.util.concurrent.TimeUnit.SECONDS);
   } finally {release.countDown();pool.shutdownNow();waiter.shutdownNow();}
   long count=jdbc.queryForObject("select count(*) from notifications where user_id=? and diary_id=?",Long.class,recipient,diary);
   assertThat(count).isEqualTo(stateFirst?0:1);
   assertThat(context.getBean(com.f106.DIO.notification.invitation.InvitationLookup.class).findForRecipient(recipient,jdbc.queryForList("select notification_id from notifications where user_id=? and diary_id=?",Long.class,recipient,diary)).values()).allMatch(t->!t.canOpen());
  }
 }
 @Test void deletedNotificationNeverReappearsOnReplay() {
  long actor=user("delete-a@example.com","delete-a"), recipient=user("delete-r@example.com","delete-r");
  UUID diary=UUID.randomUUID();jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'deletion QA')",diary,actor);
  emails.send(diary,actor,new com.f106.DIO.sharing.dto.EmailInviteRequest("delete-r@example.com"));
  long invite=jdbc.queryForObject("select invite_id from diary_invites where diary_id=?",Long.class,diary);
  UUID eventId=jdbc.queryForObject("select event_id from invitation_notification_receipts where invite_id=?",UUID.class,invite);
  var at=jdbc.queryForObject("select created_at from diary_invites where invite_id=?",java.sql.Timestamp.class,invite).toInstant();
  var tx=new org.springframework.transaction.support.TransactionTemplate(transactions);
  jdbc.update("update notifications set deleted_at=current_timestamp where user_id=?",recipient);
  assertThat(tx.execute(st->handler.handle(new com.f106.DIO.notification.event.InvitationConfirmedEvent(eventId,invite,recipient,at))).duplicate()).isTrue();
  assertThat(jdbc.queryForObject("select count(*) from notifications where user_id=? and deleted_at is null",Long.class,recipient)).isZero();
  jdbc.update("delete from notifications where user_id=?",recipient);
  assertThat(tx.execute(st->handler.handle(new com.f106.DIO.notification.event.InvitationConfirmedEvent(UUID.randomUUID(),invite,recipient,at))).duplicate()).isTrue();
  assertThat(jdbc.queryForObject("select count(*) from notifications where user_id=?",Long.class,recipient)).isZero();
  assertThat(jdbc.queryForObject("select notification_id from invitation_notification_receipts where invite_id=?",Long.class,invite)).isNull();
 }

 @Test void frontendAdaptersAgainstActualServer() throws Exception {
  long actor=user("e2e-a@example.com","e2e-a");user("e2e-b@example.com","e2e-b");
  var diaries=new java.util.ArrayList<String>();
  for(int i=0;i<5;i++){UUID id=UUID.randomUUID();diaries.add(id.toString());jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'FE end to end')",id,actor);}
  var process=new ProcessBuilder("node","../frontend/qa/invitation-e2e-250.mjs").redirectErrorStream(true).start();
  try(var out=process.getOutputStream()) {out.write(json.writeValueAsBytes(java.util.Map.of("baseUrl","http://127.0.0.1:"+port+"/api/v1","diaries",diaries)));}
  boolean done=process.waitFor(60,java.util.concurrent.TimeUnit.SECONDS);
  if(!done){process.destroyForcibly();throw new AssertionError("FE E2E timeout");}
  String output=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
  assertThat(process.exitValue()).withFailMessage(output).isZero();
  assertThat(jdbc.queryForObject("select count(*) from invitation_notification_receipts r join diary_invites i on i.invite_id=r.invite_id where i.inviter_user_id=?",Long.class,actor)).isEqualTo(3);
  System.out.println(output);
  var browser=new ProcessBuilder("node","../frontend/qa/invitation-react-browser.cjs").redirectErrorStream(true).start();
  try(var out=browser.getOutputStream()){out.write(json.writeValueAsBytes(java.util.Map.of("baseUrl","http://127.0.0.1:"+port+"/api/v1","diaries",diaries)));}
  if(!browser.waitFor(100,java.util.concurrent.TimeUnit.SECONDS)){browser.destroyForcibly();throw new AssertionError("React browser timeout");}
  String browserOutput=new String(browser.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
  assertThat(browser.exitValue()).withFailMessage(browserOutput).isZero();System.out.println(browserOutput);

 }
}
