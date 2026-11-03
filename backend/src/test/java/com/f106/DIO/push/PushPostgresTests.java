package com.f106.DIO.push;

import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.service.EmailLoginService;
import com.f106.DIO.push.service.PushInstallationService;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DIO_PUSH_TEST",matches="true")
@SpringBootTest
@org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
class PushPostgresTests {
    @DynamicPropertySource static void config(DynamicPropertyRegistry r){
        String safeUrl=PushTestDatabaseGuard.verify(System.getenv());
        r.add("spring.datasource.url",()->safeUrl);r.add("spring.datasource.username",()->"postgres");r.add("spring.datasource.password",()->System.getenv("DIO_PUSH_PASSWORD"));
        r.add("spring.jpa.hibernate.ddl-auto",()->"none");r.add("spring.flyway.enabled",()->true);
        r.add("dio.push.encryption-key",()->Base64.getEncoder().encodeToString(new byte[32]));
        r.add("dio.push.environment",()->"development");
        r.add("dio.auth.jwt-secret",()->Base64.getEncoder().encodeToString(new byte[32]));
        r.add("dio.auth.session-cleanup.enabled",()->false);
    }
    @Autowired UserRepository users; @Autowired RefreshTokenRepository sessions; @Autowired LoginJwt tokens;
    @Autowired PushInstallationService push; @Autowired EmailLoginService login; @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.test.web.servlet.MockMvc mvc;
    @Autowired com.f106.DIO.auth.service.ExpiredLoginSessionCleanup cleanup;
    @Autowired com.f106.DIO.push.service.PushRegistrationCleanup registrationCleanup;
    @Autowired com.f106.DIO.push.service.PushSessionLock sessionLock;
    @Autowired com.f106.DIO.push.service.PushKeyRotation rotation;
    @Autowired com.f106.DIO.auth.service.LoginSessionRevoker revoker;
    @Autowired com.f106.DIO.user.service.UserWithdrawalService withdrawalService;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    private record Person(long id,UUID sid,Jwt jwt) {}
    Person person(){
        String nonce=UUID.randomUUID().toString().replace("-","").substring(0,12);Instant now=Instant.now();
        User u=users.saveAndFlush(new User(nonce+"@example.test",nonce,now));
        RefreshToken t=sessions.saveAndFlush(new RefreshToken(u.getUserId(),nonce+"a".repeat(52),"test",now,now.plusSeconds(3600)));
        return new Person(u.getUserId(),t.getSessionId(),tokens.decode(tokens.issue(u.getUserId(),t.getSessionId(),now,now.plusSeconds(300))));
    }
    PushInstallationService.Input input(String token){return new PushInstallationService.Input("EXPO","ANDROID",token,"GRANTED",true);}
    @Test void registrationRetryAndVersionedAccountSwitch(){
        var a=person();var b=person();UUID id=UUID.randomUUID(),req=UUID.randomUUID();var settings=input("ExponentPushToken["+id+"]");
        var one=push.register(a.jwt(),id,req,settings);var replay=push.register(a.jwt(),id,req,settings);
        assertThat(replay).isEqualTo(one);
        assertThatThrownBy(()->push.register(a.jwt(),id,req,input("different"))).isInstanceOf(RuntimeException.class);
        UUID queued=UUID.randomUUID();Instant now=Instant.now();
        jdbc.update("insert into push_outbox(outbox_id,event_key,recipient_user_id,event_type,status,created_at,expires_at) values(?,?,?,'TEST','PENDING',?,?)",queued,queued.toString(),a.id(),java.sql.Timestamp.from(now),java.sql.Timestamp.from(now.plusSeconds(600)));
        jdbc.update("insert into push_deliveries(outbox_id,installation_id,binding_version,token_version,status,lease_id,lease_until) values(?,?,1,1,'LEASED',?,?)",queued,id,UUID.randomUUID(),java.sql.Timestamp.from(now.plusSeconds(60)));
        var moved=push.mutate(b.jwt(),id,UUID.randomUUID(),one.installationSecret(),1,"BIND",null);assertThat(moved.bindingVersion()).isEqualTo("2");
        assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,queued)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("select lease_id is null and lease_until is null from push_deliveries where outbox_id=?",Boolean.class,queued)).isTrue();
        assertThatThrownBy(()->push.mutate(a.jwt(),id,UUID.randomUUID(),one.installationSecret(),1,"UNBIND",null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class).satisfies(e->assertThat(((org.springframework.web.server.ResponseStatusException)e).getStatusCode().value()).isEqualTo(409));
        login.logout(a.jwt());assertThat(push.get(b.jwt(),id).bindingVersion()).isEqualTo("2");
    }
    @Test void concurrentSameRegistrationHasOneSecret() throws Exception {
        var a=person();UUID id=UUID.randomUUID(),req=UUID.randomUUID();var in=input("ExponentPushToken["+id+"]");
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try{var f1=pool.submit(()->{start.await();return push.register(a.jwt(),id,req,in);});var f2=pool.submit(()->{start.await();return push.register(a.jwt(),id,req,in);});start.countDown();assertThat(f1.get(20,TimeUnit.SECONDS)).isEqualTo(f2.get(20,TimeUnit.SECONDS));assertThat(jdbc.queryForObject("select count(*) from push_installations where installation_id=?",Long.class,id)).isEqualTo(1);}finally{pool.shutdownNow();}
    }
    @Test void lateOldLogoutCannotDisableNewAccountUnderRace() throws Exception {
        var a=person();var b=person();UUID id=UUID.randomUUID();var reg=push.register(a.jwt(),id,UUID.randomUUID(),input("ExponentPushToken["+id+"]"));
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try{var bind=pool.submit(()->{start.await();try{return push.mutate(b.jwt(),id,UUID.randomUUID(),reg.installationSecret(),1,"BIND",null);}catch(org.springframework.web.server.ResponseStatusException e){assertThat(e.getStatusCode().value()).isEqualTo(409);return null;}});var logout=pool.submit(()->{start.await();login.logout(a.jwt());return null;});start.countDown();var result=bind.get(20,TimeUnit.SECONDS);logout.get(20,TimeUnit.SECONDS);
          if(result!=null){assertThat(push.get(b.jwt(),id).bindingVersion()).isEqualTo("2");}else{assertThat(jdbc.queryForObject("select binding_version from push_installations where installation_id=?",Long.class,id)).isEqualTo(1);assertThat(jdbc.queryForObject("select disabled_at is not null from push_installations where installation_id=?",Boolean.class,id)).isTrue();}}
        finally{pool.shutdownNow();}
    }
    @Test void tokenUpdateAndUnbindAreIdempotent() {
        var a=person();UUID id=UUID.randomUUID();var registration=push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken["+id+"]"));
        assertThatThrownBy(()->push.mutate(a.jwt(),id,UUID.randomUUID(),registration.installationSecret(),1,"UPDATE",new PushInstallationService.Input("EXPO","IOS","ExpoPushToken["+id+"]","GRANTED",true))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class).satisfies(e->assertThat(((org.springframework.web.server.ResponseStatusException)e).getStatusCode().value()).isEqualTo(409));
        UUID updateId=UUID.randomUUID();var updated=push.mutate(a.jwt(),id,updateId,registration.installationSecret(),1,"UPDATE",input("ExpoPushToken[new"+id+"]"));
        assertThat(updated.tokenVersion()).isEqualTo("2");assertThat(push.mutate(a.jwt(),id,updateId,registration.installationSecret(),1,"UPDATE",input("ExpoPushToken[new"+id+"]"))).isEqualTo(updated);
        push.mutate(a.jwt(),id,UUID.randomUUID(),registration.installationSecret(),1,"UPDATE",new PushInstallationService.Input("EXPO","ANDROID","ExpoPushToken[new"+id+"]","DENIED",false));
        assertThat(push.mutate(a.jwt(),id,updateId,registration.installationSecret(),1,"UPDATE",input("ExpoPushToken[new"+id+"]"))).isEqualTo(updated);
        assertThatThrownBy(()->push.mutate(a.jwt(),id,updateId,registration.installationSecret(),1,"UPDATE",input("different"))).isInstanceOf(RuntimeException.class);
        UUID unbindId=UUID.randomUUID();var unbound=push.mutate(a.jwt(),id,unbindId,registration.installationSecret(),1,"UNBIND",null);assertThat(unbound.enabled()).isFalse();assertThat(unbound.bindingVersion()).isEqualTo("2");
        assertThat(push.mutate(a.jwt(),id,unbindId,registration.installationSecret(),1,"UNBIND",null)).isEqualTo(unbound);
    }
    @Test void allSessionRevocationDisablesAllInstallations(){
        var a=person();Instant now=Instant.now();var second=sessions.saveAndFlush(new RefreshToken(a.id(),UUID.randomUUID().toString().replace("-", "")+"b".repeat(32),"test",now,now.plusSeconds(3600)));
        Jwt other=tokens.decode(tokens.issue(a.id(),second.getSessionId(),now,now.plusSeconds(300)));UUID i1=UUID.randomUUID(),i2=UUID.randomUUID();
        push.register(a.jwt(),i1,UUID.randomUUID(),input("ExpoPushToken["+i1+"]"));push.register(other,i2,UUID.randomUUID(),input("ExpoPushToken["+i2+"]"));
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(status->revoker.revokeAll(a.id(),Instant.now()));
        assertThat(jdbc.queryForObject("select count(*) from push_installations where user_id=? and disabled_at is not null",Long.class,a.id())).isEqualTo(2);
        assertThatThrownBy(()->push.get(a.jwt(),i1)).isInstanceOf(RuntimeException.class);
    }
    @Test void authenticatedHttpRegistrationAndOwnerIsolation() throws Exception {
        var a=person(); var b=person(); Instant now=Instant.now();
        String auth=tokens.issue(a.id(),a.sid(),now,now.plusSeconds(300));String other=tokens.issue(b.id(),b.sid(),now,now.plusSeconds(300));
        UUID id=UUID.randomUUID(), requestId=UUID.randomUUID();
        String body="{\"installationId\":\""+id+"\",\"requestId\":\""+requestId+"\",\"settings\":{\"provider\":\"EXPO\",\"platform\":\"ANDROID\",\"permission\":\"GRANTED\",\"enabled\":true,\"pushToken\":\"ExpoPushToken["+id+"]\"}}";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/push/installations").contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
        var response=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/push/installations").header("Authorization","Bearer "+auth).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isCreated()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.installationSecret").exists()).andReturn();
        String secret=tools.jackson.databind.json.JsonMapper.builder().build().readTree(response.getResponse().getContentAsString()).get("installationSecret").asText();
        String update="{\"requestId\":\""+UUID.randomUUID()+"\",\"bindingVersion\":\"1\",\"settings\":{\"provider\":\"EXPO\",\"platform\":\"ANDROID\",\"permission\":\"GRANTED\",\"enabled\":true,\"pushToken\":\"ExpoPushToken[updated"+id+"]\"}}";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/push/installations/"+id).header("Authorization","Bearer "+auth).header("X-DIO-Installation-Secret",secret).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(update)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.tokenVersion").value("2"));
        String bind="{\"requestId\":\""+UUID.randomUUID()+"\",\"bindingVersion\":\"1\"}";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/push/installations/"+id+"/binding").header("Authorization","Bearer "+other).header("X-DIO-Installation-Secret",secret).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(bind)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.bindingVersion").value("2"));
        String unbind="{\"requestId\":\""+UUID.randomUUID()+"\",\"bindingVersion\":\"2\"}";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/push/installations/"+id+"/binding").header("Authorization","Bearer "+other).header("X-DIO-Installation-Secret",secret).contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(unbind)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNoContent());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/push/installations/"+id).header("Authorization","Bearer "+auth)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/push/installations/"+id).header("Authorization","Bearer "+other)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.installationSecret").doesNotExist()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.pushToken").doesNotExist());
    }
    @Test void refreshReuseAndExpiredCleanupDisableBindings() {
        Instant now=Instant.now();String nonce=UUID.randomUUID().toString().replace("-","").substring(0,12);
        User u=users.saveAndFlush(new User(nonce+"@example.test",nonce,now));String refresh=com.f106.DIO.auth.support.LoginSecrets.refresh();
        RefreshToken session=sessions.saveAndFlush(new RefreshToken(u.getUserId(),com.f106.DIO.auth.support.LoginSecrets.hash(refresh),"test",now,now.plusSeconds(3600)));
        Jwt jwt=tokens.decode(tokens.issue(u.getUserId(),session.getSessionId(),now,now.plusSeconds(300)));UUID first=UUID.randomUUID();
        push.register(jwt,first,UUID.randomUUID(),input("ExpoPushToken["+first+"]"));login.refresh(refresh);
        assertThatThrownBy(()->login.refresh(refresh)).isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("select disabled_at is not null from push_installations where installation_id=?",Boolean.class,first)).isTrue();
        var next=person();UUID second=UUID.randomUUID();push.register(next.jwt(),second,UUID.randomUUID(),input("ExpoPushToken["+second+"]"));
        jdbc.update("update refresh_tokens set expires_at=? where session_id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(60)),next.sid());
        cleanup.purgeExpired();assertThat(jdbc.queryForObject("select disabled_at is not null from push_installations where installation_id=?",Boolean.class,second)).isTrue();
    }
    @Test void expiredRegistrationCannotRegenerateCredentialAndCiphertextIsCleared() {
        var a=person();UUID id=UUID.randomUUID(),request=UUID.randomUUID();var in=input("ExpoPushToken["+id+"]");push.register(a.jwt(),id,request,in);
        jdbc.update("update push_registration_requests set expires_at=? where installation_id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(1)),id);
        assertThatThrownBy(()->push.register(a.jwt(),id,request,in)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .satisfies(e->assertThat(((org.springframework.web.server.ResponseStatusException)e).getStatusCode().value()).isEqualTo(410));
        assertThat(registrationCleanup.clearExpired(Instant.now())).isPositive();
        assertThat(jdbc.queryForObject("select encrypted_response is null from push_registration_requests where installation_id=?",Boolean.class,id)).isTrue();
        assertThatThrownBy(()->push.register(a.jwt(),id,request,in)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
    @Test void duplicateTokenCannotTransferOwnershipWithoutInstallationSecret() {
        var a=person();var b=person();UUID first=UUID.randomUUID(),second=UUID.randomUUID();var in=input("ExpoPushToken["+first+"]");
        var registered=push.register(a.jwt(),first,UUID.randomUUID(),in);
        assertThatThrownBy(()->push.register(b.jwt(),second,UUID.randomUUID(),in)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .satisfies(e->assertThat(((org.springframework.web.server.ResponseStatusException)e).getStatusCode().value()).isEqualTo(409));
        assertThat(push.get(a.jwt(),first).bindingVersion()).isEqualTo("1");
        assertThatThrownBy(()->push.mutate(b.jwt(),first,UUID.randomUUID(),"invalid-secret",1,"BIND",null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
    @Test void allSessionsRevocationAndConcurrentRebindDoNotDeadlock() throws Exception {
        var a=person();Instant now=Instant.now();var second=sessions.saveAndFlush(new RefreshToken(a.id(),UUID.randomUUID().toString().replace("-", "")+"c".repeat(32),"test",now,now.plusSeconds(3600)));
        Jwt other=tokens.decode(tokens.issue(a.id(),second.getSessionId(),now,now.plusSeconds(300)));UUID id=UUID.randomUUID();var reg=push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken["+id+"]"));
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try {
            var all=pool.submit(()->{start.await();new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(status->revoker.revokeAll(a.id(),Instant.now()));return null;});
            var rebind=pool.submit(()->{start.await();try{push.mutate(other,id,UUID.randomUUID(),reg.installationSecret(),1,"BIND",null);}catch(com.f106.DIO.auth.exception.LoginException e){assertThat(e.status.value()).isEqualTo(401);}catch(org.springframework.web.server.ResponseStatusException e){assertThat(e.getStatusCode().value()).isEqualTo(409);}return null;});
            start.countDown();all.get(20,TimeUnit.SECONDS);rebind.get(20,TimeUnit.SECONDS);
            assertThat(jdbc.queryForObject("select disabled_at is not null from push_installations where installation_id=?",Boolean.class,id)).isTrue();
            assertThat(jdbc.queryForObject("select count(*) from refresh_tokens where user_id=? and revoked_at is null",Long.class,a.id())).isZero();
        } finally {pool.shutdownNow();}
    }
    @Test void newAccountCanRebindAfterOldSessionLoggedOut() {
        var a=person();var b=person();UUID id=UUID.randomUUID();var registration=push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken["+id+"]"));
        login.logout(a.jwt());var bound=push.mutate(b.jwt(),id,UUID.randomUUID(),registration.installationSecret(),1,"BIND",null);
        assertThat(bound.bindingVersion()).isEqualTo("2");assertThat(bound.enabled()).isFalse();
        assertThatThrownBy(()->push.mutate(a.jwt(),id,UUID.randomUUID(),registration.installationSecret(),1,"UNBIND",null)).isInstanceOf(RuntimeException.class);
    }
    @Test void installationIsIsolatedAcrossEnvironmentAndApplication() {
        var a=person();UUID id=UUID.randomUUID();push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken["+id+"]"));
        String key=Base64.getEncoder().encodeToString(new byte[32]);
        for (String[] scope : new String[][]{{"other-environment","dio"},{"development","other-app"}}) {
            var other=new PushInstallationService(jdbc,sessionLock,key,scope[0],scope[1]);
            assertThatThrownBy(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->other.get(a.jwt(),id)))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .satisfies(e->assertThat(((org.springframework.web.server.ResponseStatusException)e).getStatusCode().value()).isEqualTo(404));
        }
    }
    @Test void sessionExpiringWhileSessionLockWaitsIsRejected() throws Exception {
        var a=person();UUID id=UUID.randomUUID();push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken["+id+"]"));
        jdbc.update("update refresh_tokens set expires_at=? where session_id=?",java.sql.Timestamp.from(Instant.now().plusSeconds(3)),a.sid());
        var pool=Executors.newFixedThreadPool(2);var locked=new CountDownLatch(1);var release=new CountDownLatch(1);var entered=new CountDownLatch(1);
        try {
            var holder=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{jdbc.queryForObject("select token_id from refresh_tokens where session_id=? for update",Long.class,a.sid());locked.countDown();try{if(!release.await(12,TimeUnit.SECONDS))throw new AssertionError("release timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;}));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();var waiting=pool.submit(()->{entered.countDown();return push.get(a.jwt(),id);});assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(()->waiting.get(300,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            Thread.sleep(3500);release.countDown();holder.get(5,TimeUnit.SECONDS);
            assertThatThrownBy(()->waiting.get(5,TimeUnit.SECONDS)).hasCauseInstanceOf(com.f106.DIO.auth.exception.LoginException.class);
        } finally {release.countDown();pool.shutdownNow();}
    }
    @Test void registrationReplayExpiringWhileInstallationLockWaitsIsRejected() throws Exception {
        var a=person();UUID id=UUID.randomUUID(),request=UUID.randomUUID();var settings=input("ExpoPushToken["+id+"]");push.register(a.jwt(),id,request,settings);
        jdbc.update("update push_registration_requests set expires_at=? where installation_id=?",java.sql.Timestamp.from(Instant.now().plusSeconds(3)),id);
        var pool=Executors.newFixedThreadPool(2);var locked=new CountDownLatch(1);var release=new CountDownLatch(1);var entered=new CountDownLatch(1);
        try {
            var holder=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{jdbc.queryForObject("select installation_id from push_installations where installation_id=? for update",UUID.class,id);locked.countDown();try{if(!release.await(12,TimeUnit.SECONDS))throw new AssertionError("release timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;}));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();var waiting=pool.submit(()->{entered.countDown();return push.register(a.jwt(),id,request,settings);});assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(()->waiting.get(300,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            Thread.sleep(3500);release.countDown();holder.get(5,TimeUnit.SECONDS);
            assertThatThrownBy(()->waiting.get(5,TimeUnit.SECONDS)).hasCauseInstanceOf(org.springframework.web.server.ResponseStatusException.class).satisfies(e->assertThat(((org.springframework.web.server.ResponseStatusException)e.getCause()).getStatusCode().value()).isEqualTo(410));
        } finally {release.countDown();pool.shutdownNow();}
    }
    @Test void sessionExpiringWhileInstallationLockWaitsIsRejected() throws Exception {
        var a=person();UUID id=UUID.randomUUID();push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken["+id+"]"));
        jdbc.update("update refresh_tokens set expires_at=? where session_id=?",java.sql.Timestamp.from(Instant.now().plusSeconds(3)),a.sid());
        var pool=Executors.newFixedThreadPool(2);var locked=new CountDownLatch(1);var release=new CountDownLatch(1);var entered=new CountDownLatch(1);
        try {
            var holder=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{jdbc.queryForObject("select installation_id from push_installations where installation_id=? for update",UUID.class,id);locked.countDown();try{if(!release.await(12,TimeUnit.SECONDS))throw new AssertionError("release timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;}));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();var waiting=pool.submit(()->{entered.countDown();return push.get(a.jwt(),id);});assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(()->waiting.get(300,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            Thread.sleep(3500);release.countDown();holder.get(5,TimeUnit.SECONDS);
            assertThatThrownBy(()->waiting.get(5,TimeUnit.SECONDS)).hasCauseInstanceOf(com.f106.DIO.auth.exception.LoginException.class);
        } finally {release.countDown();pool.shutdownNow();}
    }
    @Test void installationIdMustBeRandomUuidV4() {
        var user=person();var invalid=UUID.fromString("00000000-0000-1000-8000-000000000001");
        assertThatThrownBy(()->push.register(user.jwt(),invalid,UUID.randomUUID(),input("ExpoPushToken[bad]")))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .satisfies(e->assertThat(((org.springframework.web.server.ResponseStatusException)e).getStatusCode().value()).isEqualTo(400));
    }
    @Test void rotationRacesTokenUpdateAndAccountTransferWithoutLosingChanges() throws Exception {
        var a=person();var b=person();UUID id=UUID.randomUUID(),request=UUID.randomUUID();var initial=input("ExpoPushToken["+id+"]");var reg=push.register(a.jwt(),id,request,initial);
        byte[] newBytes=new byte[32];newBytes[0]=1;String oldKey=Base64.getEncoder().encodeToString(new byte[32]),newKey=Base64.getEncoder().encodeToString(newBytes);
        org.springframework.test.util.ReflectionTestUtils.setField(push,"configuredKeys","legacy="+oldKey+";new="+newKey);
        org.springframework.test.util.ReflectionTestUtils.setField(push,"activeKeyId","new");
        var oldInstance=new PushInstallationService(jdbc,sessionLock,oldKey,"development","dio");
        org.springframework.test.util.ReflectionTestUtils.setField(oldInstance,"configuredKeys","legacy="+oldKey+";new="+newKey);
        var pool=Executors.newFixedThreadPool(4);var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
        try {
            var holder=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{jdbc.queryForObject("select installation_id from push_installations where installation_id=? for update",UUID.class,id);locked.countDown();try{if(!release.await(15,TimeUnit.SECONDS))throw new AssertionError("lock timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;}));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
            rotation.rotateBatch("development","dio",100);
            assertThat(jdbc.queryForObject("select token_key_id from push_installations where installation_id=?",String.class,id)).isEqualTo("legacy");
            assertThat(rotation.remaining("development","dio")).isPositive();
            var updating=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->oldInstance.mutate(a.jwt(),id,UUID.randomUUID(),reg.installationSecret(),1,"UPDATE",input("ExpoPushToken[updated"+id+"]"))));
            assertThatThrownBy(()->updating.get(300,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown();holder.get(5,TimeUnit.SECONDS);assertThat(updating.get(20,TimeUnit.SECONDS).tokenVersion()).isEqualTo("2");
            rotation.rotateBatch("development","dio",100);
            var legacy=new com.f106.DIO.push.security.PushKeyring("legacy",Map.of("legacy",oldKey));
            var fixture=legacy.encrypt(("ExpoPushToken[updated"+id+"]").getBytes(java.nio.charset.StandardCharsets.UTF_8),("development|dio|"+id+"|token").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            jdbc.update("update push_installations set token_ciphertext=?,token_key_id='legacy',token_cipher_format=1 where installation_id=?",fixture.ciphertext(),id);
            var secondLocked=new CountDownLatch(1);var secondRelease=new CountDownLatch(1);
            var secondHolder=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{jdbc.queryForObject("select installation_id from push_installations where installation_id=? for update",UUID.class,id);secondLocked.countDown();try{if(!secondRelease.await(15,TimeUnit.SECONDS))throw new AssertionError("lock timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;}));
            try {
                assertThat(secondLocked.await(5,TimeUnit.SECONDS)).isTrue();rotation.rotateBatch("development","dio",100);
                assertThat(jdbc.queryForObject("select token_key_id from push_installations where installation_id=?",String.class,id)).isEqualTo("legacy");
                var transferred=pool.submit(()->push.mutate(b.jwt(),id,UUID.randomUUID(),reg.installationSecret(),1,"BIND",null));
                assertThatThrownBy(()->transferred.get(300,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                secondRelease.countDown();secondHolder.get(5,TimeUnit.SECONDS);assertThat(transferred.get(20,TimeUnit.SECONDS).bindingVersion()).isEqualTo("2");
            } finally {secondRelease.countDown();}
            rotation.rotateBatch("development","dio",100);
            var row=jdbc.queryForMap("select user_id,binding_version,token_version,token_ciphertext,token_key_id,token_cipher_format from push_installations where installation_id=?",id);
            assertThat(((Number)row.get("user_id")).longValue()).isEqualTo(b.id());assertThat(((Number)row.get("binding_version")).longValue()).isEqualTo(2);assertThat(((Number)row.get("token_version")).longValue()).isEqualTo(2);
            assertThat(row.get("token_key_id")).isEqualTo("new");assertThat(((Number)row.get("token_cipher_format")).intValue()).isEqualTo(1);
            var keys=new com.f106.DIO.push.security.PushKeyring("new",Map.of("legacy",oldKey,"new",newKey));
            byte[] aad=("development|dio|"+id+"|token").getBytes(java.nio.charset.StandardCharsets.UTF_8);
            assertThat(new String(keys.decrypt("new",(byte[])row.get("token_ciphertext"),aad),java.nio.charset.StandardCharsets.UTF_8)).isEqualTo("ExpoPushToken[updated"+id+"]");
            assertThat(jdbc.queryForObject("select response_key_id from push_registration_requests where installation_id=?",String.class,id)).isEqualTo("new");
            assertThat(rotation.rotateBatch("development","dio",100)).isZero();
            assertThat(rotation.remaining("development","dio")).isZero();
        } finally {release.countDown();pool.shutdownNow();org.springframework.test.util.ReflectionTestUtils.setField(push,"activeKeyId","legacy");org.springframework.test.util.ReflectionTestUtils.setField(push,"configuredKeys","");}
    }
    @Test void legacyCiphertextRemainsReadableAndCanBeRotated() {
        var a=person();UUID id=UUID.randomUUID(),request=UUID.randomUUID();var in=input("ExpoPushToken["+id+"]");var result=push.register(a.jwt(),id,request,in);
        String oldKey=Base64.getEncoder().encodeToString(new byte[32]);byte[] newer=new byte[32];newer[0]=1;String newKey=Base64.getEncoder().encodeToString(newer);
        var legacy=new com.f106.DIO.push.security.PushSecrets(oldKey);var text=java.nio.charset.StandardCharsets.UTF_8;
        jdbc.update("update push_installations set token_ciphertext=?,token_key_id='legacy',token_cipher_format=0 where installation_id=?",legacy.encrypt(in.pushToken().getBytes(text),("development|dio|"+id+"|token").getBytes(text)),id);
        jdbc.update("update push_registration_requests set encrypted_response=?,response_key_id='legacy',response_cipher_format=0 where installation_id=?",legacy.encrypt(result.installationSecret().getBytes(text),("development|dio|"+id+"|registration:"+request).getBytes(text)),id);
        assertThat(push.register(a.jwt(),id,request,in)).isEqualTo(result);
        var withoutOld=new PushInstallationService(jdbc,sessionLock,"","development","dio");
        org.springframework.test.util.ReflectionTestUtils.setField(withoutOld,"configuredKeys","new="+newKey);org.springframework.test.util.ReflectionTestUtils.setField(withoutOld,"activeKeyId","new");
        assertThatThrownBy(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->withoutOld.register(a.jwt(),id,request,in)))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
            .satisfies(e->assertThat(((org.springframework.web.server.ResponseStatusException)e).getStatusCode().value()).isEqualTo(503));
        org.springframework.test.util.ReflectionTestUtils.setField(push,"configuredKeys","legacy="+oldKey+";new="+newKey);org.springframework.test.util.ReflectionTestUtils.setField(push,"activeKeyId","new");
        try {
            rotation.rotateBatch("development","dio",100);
            assertThat(jdbc.queryForObject("select token_key_id from push_installations where installation_id=?",String.class,id)).isEqualTo("new");
            assertThat(jdbc.queryForObject("select response_key_id from push_registration_requests where installation_id=?",String.class,id)).isEqualTo("new");
            assertThat(push.register(a.jwt(),id,request,in)).isEqualTo(result);
        } finally {org.springframework.test.util.ReflectionTestUtils.setField(push,"activeKeyId","legacy");org.springframework.test.util.ReflectionTestUtils.setField(push,"configuredKeys","");}
    }
    @Test void rotationReportsBadCiphertextAndContinuesPastIt() {
        var a=person();UUID bad=UUID.randomUUID(),good=UUID.randomUUID();
        push.register(a.jwt(),bad,UUID.randomUUID(),input("ExpoPushToken[bad"+bad+"]"));
        push.register(a.jwt(),good,UUID.randomUUID(),input("ExpoPushToken[good"+good+"]"));
        byte[] newer=new byte[32];newer[0]=1;
        String oldKey=Base64.getEncoder().encodeToString(new byte[32]),newKey=Base64.getEncoder().encodeToString(newer);
        jdbc.update("update push_installations set token_ciphertext=? where installation_id=?",new byte[29],bad);
        org.springframework.test.util.ReflectionTestUtils.setField(push,"configuredKeys","legacy="+oldKey+";new="+newKey);
        org.springframework.test.util.ReflectionTestUtils.setField(push,"activeKeyId","new");
        try {
            var result=rotation.rotateBatchReport("development","dio",500,null);
            assertThat(result.failed()).contains(bad);
            assertThat(jdbc.queryForObject("select token_key_id from push_installations where installation_id=?",String.class,good)).isEqualTo("new");
            assertThat(jdbc.queryForObject("select token_key_id from push_installations where installation_id=?",String.class,bad)).isEqualTo("legacy");
            assertThat(rotation.remaining("development","dio")).isPositive();
        } finally {
            jdbc.update("delete from push_registration_requests where installation_id in (?,?)",bad,good);
            jdbc.update("delete from push_installations where installation_id in (?,?)",bad,good);
            org.springframework.test.util.ReflectionTestUtils.setField(push,"activeKeyId","legacy");org.springframework.test.util.ReflectionTestUtils.setField(push,"configuredKeys","");
        }
    }
    @Test void orphanCiphertextsAreCountedAndExpiredOnesCanBeCleared() {
        var a=person();UUID id=UUID.randomUUID();push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken[orphan"+id+"]"));
        jdbc.update("delete from push_installations where installation_id=?",id);
        long before=rotation.orphanCiphertexts();assertThat(before).isPositive();
        jdbc.update("update push_registration_requests set expires_at=? where installation_id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(1)),id);
        registrationCleanup.clearExpired(Instant.now());
        assertThat(rotation.orphanCiphertexts()).isLessThan(before);
    }

    @Test void operatorRecoversAfterOldKeyIsRestored() throws Exception {
        var a=person();UUID id=UUID.randomUUID(),request=UUID.randomUUID();var input=input("ExpoPushToken[recover"+id+"]");
        var registration=push.register(a.jwt(),id,request,input);
        byte[] newBytes=new byte[32];newBytes[0]=1;
        String old=Base64.getEncoder().encodeToString(new byte[32]),next=Base64.getEncoder().encodeToString(newBytes);
        var env=new HashMap<String,String>();env.put("PUSH_ENVIRONMENT","development");env.put("PUSH_APP_ID","dio");env.put("PUSH_ACTIVE_KEY_ID","new");
        env.put("PUSH_ENCRYPTION_KEYS","new="+next);env.put("DB_URL",System.getenv("DIO_PUSH_URL"));env.put("POSTGRES_USER","postgres");env.put("POSTGRES_PASSWORD",System.getenv("DIO_PUSH_PASSWORD"));
        try {
            var output=new java.io.ByteArrayOutputStream();
            assertThat(com.f106.DIO.push.service.PushKeyOperator.run(new String[]{"batch","500","-"},env,new java.io.PrintStream(output))).isEqualTo(2);
            assertThat(output.toString()).contains("failed_installation="+id).doesNotContain(old,next);
            env.put("PUSH_ENCRYPTION_KEYS","legacy="+old+";new="+next);
            output.reset();assertThat(com.f106.DIO.push.service.PushKeyOperator.run(new String[]{"batch","500","-"},env,new java.io.PrintStream(output))).isZero();
            assertThat(jdbc.queryForObject("select token_key_id from push_installations where installation_id=?",String.class,id)).isEqualTo("new");
            org.springframework.test.util.ReflectionTestUtils.setField(push,"configuredKeys",env.get("PUSH_ENCRYPTION_KEYS"));
            org.springframework.test.util.ReflectionTestUtils.setField(push,"activeKeyId","new");
            assertThat(push.register(a.jwt(),id,request,input)).isEqualTo(registration);
        } finally {
            jdbc.update("delete from push_registration_requests where installation_id=?",id);jdbc.update("delete from push_installations where installation_id=?",id);
            org.springframework.test.util.ReflectionTestUtils.setField(push,"activeKeyId","legacy");org.springframework.test.util.ReflectionTestUtils.setField(push,"configuredKeys","");
        }
    }
    @Test void expiredOrphanCleanupSkipsLockedRowAndRetries() throws Exception {
        var a=person();UUID id=UUID.randomUUID();push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken[lockedOrphan"+id+"]"));
        jdbc.update("delete from push_installations where installation_id=?",id);
        jdbc.update("update push_registration_requests set expires_at=? where installation_id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(1)),id);
        var pool=Executors.newSingleThreadExecutor();var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
        try {
            var holder=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{
                jdbc.queryForObject("select installation_id from push_registration_requests where installation_id=? for update",UUID.class,id);locked.countDown();
                try{if(!release.await(10,TimeUnit.SECONDS))throw new AssertionError("timeout");}catch(InterruptedException ex){throw new RuntimeException(ex);}return null;}));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();registrationCleanup.clearExpired(Instant.now());
            assertThat(jdbc.queryForObject("select encrypted_response is not null from push_registration_requests where installation_id=?",Boolean.class,id)).isTrue();
            release.countDown();holder.get(5,TimeUnit.SECONDS);registrationCleanup.clearExpired(Instant.now());
            assertThat(jdbc.queryForObject("select encrypted_response is null from push_registration_requests where installation_id=?",Boolean.class,id)).isTrue();
        } finally {release.countDown();pool.shutdownNow();jdbc.update("delete from push_registration_requests where installation_id=?",id);}
    }

    @Test void unexpiredOrphanSurvivesCleanupConcurrentWithDeleteAndReregistration() throws Exception {
        var a=person();var b=person();UUID id=UUID.randomUUID(),originalRequest=UUID.randomUUID();
        push.register(a.jwt(),id,originalRequest,input("ExpoPushToken[before"+id+"]"));
        var pool=Executors.newFixedThreadPool(2);var deleted=new CountDownLatch(1);var release=new CountDownLatch(1);
        try {
            var deletion=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{
                jdbc.update("delete from push_installations where installation_id=?",id);deleted.countDown();
                try{if(!release.await(10,TimeUnit.SECONDS))throw new AssertionError("timeout");}catch(InterruptedException ex){throw new RuntimeException(ex);}return null;}));
            assertThat(deleted.await(5,TimeUnit.SECONDS)).isTrue();
            var registration=pool.submit(()->push.register(b.jwt(),id,UUID.randomUUID(),input("ExpoPushToken[after"+id+"]")));
            assertThatThrownBy(()->registration.get(300,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            registrationCleanup.clearExpired(Instant.now());release.countDown();deletion.get(5,TimeUnit.SECONDS);registration.get(10,TimeUnit.SECONDS);
            assertThat(jdbc.queryForObject("select encrypted_response is not null from push_registration_requests where installation_id=? and request_id=?",Boolean.class,id,originalRequest)).isTrue();
            assertThat(jdbc.queryForObject("select user_id from push_installations where installation_id=?",Long.class,id)).isEqualTo(b.id());
        } finally {release.countDown();pool.shutdownNow();jdbc.update("delete from push_registration_requests where installation_id=?",id);jdbc.update("delete from push_installations where installation_id=?",id);}
    }

    @Test void databaseBackupRestoresCiphertextReadableWithRetainedKey() throws Exception {
        String url=System.getenv("DIO_PUSH_URL"),bin=System.getenv("DIO_PUSH_PGBIN");
        org.junit.jupiter.api.Assumptions.assumeTrue(bin!=null && !bin.isBlank());
        assertThat(url).matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/pushqa_[a-f0-9]+");
        var uri=java.net.URI.create(url.substring(5));String restore="pushrestore_"+UUID.randomUUID().toString().replace("-","");
        var a=person();UUID id=UUID.randomUUID();String token="ExpoPushToken[backup"+id+"]";
        push.register(a.jwt(),id,UUID.randomUUID(),input(token));
        var archive=java.nio.file.Files.createTempFile("dio-push-backup-", ".dump");
        String password=System.getenv("DIO_PUSH_PASSWORD");boolean created=false;
        try {
            runPg(bin,"pg_dump",password,"-h","127.0.0.1","-p",String.valueOf(uri.getPort()),"-U","postgres","-Fc","-f",archive.toString(),uri.getPath().substring(1));
            runPg(bin,"createdb",password,"-h","127.0.0.1","-p",String.valueOf(uri.getPort()),"-U","postgres",restore);created=true;
            runPg(bin,"pg_restore",password,"-h","127.0.0.1","-p",String.valueOf(uri.getPort()),"-U","postgres","--no-owner","--no-privileges","-d",restore,archive.toString());
            var source=new org.springframework.jdbc.datasource.DriverManagerDataSource("jdbc:postgresql://127.0.0.1:"+uri.getPort()+"/"+restore,"postgres",password);
            var restored=new org.springframework.jdbc.core.JdbcTemplate(source);
            byte[] ciphertext=restored.queryForObject("select token_ciphertext from push_installations where installation_id=?",byte[].class,id);
            String retained=Base64.getEncoder().encodeToString(new byte[32]);var keys=new com.f106.DIO.push.security.PushKeyring("legacy",Map.of("legacy",retained));
            byte[] aad=("development|dio|"+id+"|token").getBytes(java.nio.charset.StandardCharsets.UTF_8);
            assertThat(new String(keys.decrypt("legacy",ciphertext,aad),java.nio.charset.StandardCharsets.UTF_8)).isEqualTo(token);
            var wrong=new byte[32];wrong[0]=1;var incorrect=new com.f106.DIO.push.security.PushKeyring("legacy",Map.of("legacy",Base64.getEncoder().encodeToString(wrong)));
            assertThatThrownBy(()->incorrect.decrypt("legacy",ciphertext,aad)).isInstanceOf(IllegalArgumentException.class);
        } finally {
            if(created)runPg(bin,"dropdb",password,"-h","127.0.0.1","-p",String.valueOf(uri.getPort()),"-U","postgres",restore);
            java.nio.file.Files.deleteIfExists(archive);
        }
    }
    private static void runPg(String bin,String program,String password,String...args) throws Exception {
        var command=new ArrayList<String>();String executable=program+(System.getProperty("os.name").toLowerCase(java.util.Locale.ROOT).startsWith("windows")?".exe":"");command.add(java.nio.file.Path.of(bin,executable).toString());command.addAll(Arrays.asList(args));
        var builder=new ProcessBuilder(command).redirectErrorStream(true);builder.environment().put("PGPASSWORD",password);
        var process=builder.start();String output=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        if(!process.waitFor(60,TimeUnit.SECONDS) || process.exitValue()!=0)throw new AssertionError(program+" failed: "+output);
    }

    @Test void operatorMustRewindCursorForLockedRows() throws Exception {
        var a=person();UUID id=UUID.randomUUID();push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken[cursor"+id+"]"));
        byte[] nextBytes=new byte[32];nextBytes[0]=1;String old=Base64.getEncoder().encodeToString(new byte[32]),next=Base64.getEncoder().encodeToString(nextBytes);
        var env=new HashMap<String,String>();env.put("PUSH_ENVIRONMENT","development");env.put("PUSH_APP_ID","dio");env.put("PUSH_ACTIVE_KEY_ID","new");env.put("PUSH_ENCRYPTION_KEYS","legacy="+old+";new="+next);env.put("DB_URL",System.getenv("DIO_PUSH_URL"));env.put("POSTGRES_USER","postgres");env.put("POSTGRES_PASSWORD",System.getenv("DIO_PUSH_PASSWORD"));
        var pool=Executors.newSingleThreadExecutor();var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
        try {
            var holder=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{jdbc.queryForObject("select installation_id from push_installations where installation_id=? for update",UUID.class,id);locked.countDown();try{if(!release.await(10,TimeUnit.SECONDS))throw new AssertionError("timeout");}catch(InterruptedException ex){throw new RuntimeException(ex);}return null;}));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();var bytes=new java.io.ByteArrayOutputStream();
            com.f106.DIO.push.service.PushKeyOperator.run(new String[]{"batch","500","-"},env,new java.io.PrintStream(bytes));
            assertThat(bytes.toString()).doesNotContain("remaining_installations=0");
            release.countDown();holder.get(5,TimeUnit.SECONDS);bytes.reset();
            com.f106.DIO.push.service.PushKeyOperator.run(new String[]{"batch","500","-"},env,new java.io.PrintStream(bytes));
            assertThat(jdbc.queryForObject("select token_key_id from push_installations where installation_id=?",String.class,id)).isEqualTo("new");
        } finally {release.countDown();pool.shutdownNow();jdbc.update("delete from push_registration_requests where installation_id=?",id);jdbc.update("delete from push_installations where installation_id=?",id);}
    }

    @Test void checksumMatchedLegacyV21UpgradesWithFlywayAndPreservesCiphertext() {
        String schema="pushupgrade_"+UUID.randomUUID().toString().replace("-","");
        jdbc.execute("create schema "+schema);
        try {
            jdbc.execute("create table "+schema+".users(user_id bigint primary key)");jdbc.update("insert into "+schema+".users values(1)");
            var configuration=org.flywaydb.core.Flyway.configure().dataSource(jdbc.getDataSource()).schemas(schema).defaultSchema(schema)
                .locations("classpath:push-legacy-migrations").baselineOnMigrate(true).baselineVersion("20").target("21");
            configuration.load().migrate();
            assertThat(jdbc.queryForObject("select checksum from "+schema+".flyway_schema_history where version='21'",Integer.class)).isEqualTo(-212152374);
            assertThatThrownBy(()->org.flywaydb.core.Flyway.configure().dataSource(jdbc.getDataSource()).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().validate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class).hasMessageContaining("checksum");
            UUID id=UUID.randomUUID(),sid=UUID.randomUUID(),request=UUID.randomUUID();String key=Base64.getEncoder().encodeToString(new byte[32]);
            var legacy=new com.f106.DIO.push.security.PushSecrets(key);byte[] aad=("development|dio|"+id+"|token").getBytes(java.nio.charset.StandardCharsets.UTF_8);
            byte[] ciphertext=legacy.encrypt("ExpoPushToken[legacy]".getBytes(java.nio.charset.StandardCharsets.UTF_8),aad);
            jdbc.update("insert into "+schema+".push_installations(installation_id,environment,app_id,user_id,session_id,credential_hash,provider,platform,token_ciphertext,token_hash,permission,enabled,binding_version,token_version,created_at,updated_at) values(?,?,?,1,?,?,'EXPO','ANDROID',?,?,'GRANTED',true,1,1,now(),now())",id,"development","dio",sid,new byte[32],ciphertext,new byte[32]);
            byte[] response=legacy.encrypt("credential".getBytes(java.nio.charset.StandardCharsets.UTF_8),("development|dio|"+id+"|registration:"+request).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            jdbc.update("insert into "+schema+".push_registration_requests(session_id,installation_id,request_id,request_hash,encrypted_response,expires_at,created_at) values(?,?,?,?,?,now()+interval '1 hour',now())",sid,id,request,new byte[32],response);
            org.flywaydb.core.Flyway.configure().dataSource(jdbc.getDataSource()).schemas(schema).defaultSchema(schema).locations("classpath:push-legacy-migrations").load().migrate();
            assertThat(jdbc.queryForObject("select token_key_id from "+schema+".push_installations where installation_id=?",String.class,id)).isEqualTo("legacy");
            assertThat(jdbc.queryForObject("select token_cipher_format from "+schema+".push_installations where installation_id=?",Integer.class,id)).isZero();
            assertThat(jdbc.queryForObject("select response_key_id from "+schema+".push_registration_requests where installation_id=?",String.class,id)).isEqualTo("legacy");
            byte[] restored=jdbc.queryForObject("select token_ciphertext from "+schema+".push_installations where installation_id=?",byte[].class,id);
            assertThat(new String(legacy.decrypt(restored,aad),java.nio.charset.StandardCharsets.UTF_8)).isEqualTo("ExpoPushToken[legacy]");
            UUID outbox=UUID.randomUUID();jdbc.update("insert into "+schema+".push_outbox(outbox_id,event_key,recipient_user_id,event_type,status,created_at,expires_at) values(?,?,1,'TEST','PENDING',now(),now()+interval '1 hour')",outbox,outbox.toString());
            jdbc.update("insert into "+schema+".push_deliveries(outbox_id,installation_id,binding_version,token_version,status) values(?,?,1,1,'PENDING')",outbox,id);
            jdbc.update("delete from "+schema+".push_installations where installation_id=?",id);
            assertThat(jdbc.queryForObject("select count(*) from "+schema+".push_deliveries where outbox_id=?",Long.class,outbox)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from "+schema+".push_outbox where outbox_id=?",Long.class,outbox)).isEqualTo(1);
        } finally {jdbc.execute("drop schema "+schema+" cascade");}
    }

    private record RetentionFixture(Person recipient,PushInstallationService service,com.f106.DIO.push.service.PushQueueRetention retention,UUID installation,UUID outbox,long invite,String secret) {}
    private RetentionFixture retentionFixture(String status) {
        var recipient=person();UUID installation=UUID.randomUUID(),outbox=UUID.randomUUID();long invite=Math.abs(UUID.randomUUID().getLeastSignificantBits()>>>1)+1;
        String scope="ret-"+UUID.randomUUID().toString().replace("-","").substring(0,16);
        var service=new PushInstallationService(jdbc,sessionLock,Base64.getEncoder().encodeToString(new byte[32]),scope,"dio");
        var registered=new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(st->service.register(recipient.jwt(),installation,UUID.randomUUID(),input("ExpoPushToken[ret"+installation+"]")));
        jdbc.update("insert into invitation_notification_receipts(event_id,recipient_user_id,invite_id,event_occurred_at,outcome,processed_at) values(?,?,?,now(),'CREATED',now())",UUID.randomUUID(),recipient.id(),invite);
        jdbc.update("insert into push_outbox(outbox_id,event_key,recipient_user_id,event_type,reference_id,status,created_at,expires_at,environment,app_id) values(?,?,?,'DIARY_INVITE',?,?,now()-interval '10 days',now()-interval '9 days',?,'dio')",outbox,"ret:"+outbox,recipient.id(),Long.toString(invite),status,scope);
        return new RetentionFixture(recipient,service,new com.f106.DIO.push.service.PushQueueRetention(jdbc,service),installation,outbox,invite,registered.installationSecret());
    }
    private com.f106.DIO.push.service.PushQueueRetention.Result retain(RetentionFixture f,Instant now) {
        return new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(st->f.retention().runBatch(now,100));
    }
    private void delivery(RetentionFixture f,String status,String result) {
        jdbc.update("insert into push_deliveries(outbox_id,installation_id,binding_version,token_version,status,result_code) values(?,?,1,1,?,?)",f.outbox(),f.installation(),status,result);
    }
    @Test void retentionCancelsExpiredThenWaitsThirtyDaysAndPreservesDedupReceipt() {
        var f=retentionFixture("PENDING");delivery(f,"PENDING",null);
        var result=retain(f,Instant.now());assertThat(result.cancelled()).isEqualTo(2);assertThat(result.deleted()).isZero();
        assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,f.outbox())).isEqualTo("CANCELLED");
        Instant last=jdbc.queryForObject("select greatest(o.terminal_at,d.terminal_at) from push_outbox o join push_deliveries d on d.outbox_id=o.outbox_id where o.outbox_id=?",Timestamp.class,f.outbox()).toInstant();
        Instant boundary=last.plusSeconds(30*86400L);
        assertThat(retain(f,boundary.minusNanos(1000)).deleted()).isZero();
        assertThat(retain(f,boundary).deleted()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from push_deliveries where outbox_id=?",Long.class,f.outbox())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from invitation_notification_receipts where invite_id=? and recipient_user_id=?",Long.class,f.invite(),f.recipient().id())).isEqualTo(1);
    }
    @Test void retentionKeepsReceiptPendingAndUnscopedOrUnverifiedRows() {
        var f=retentionFixture("COMPLETE");delivery(f,"SENT","RECEIPT_PENDING");
        jdbc.update("update push_outbox set terminal_at=now()-interval '31 days' where outbox_id=?",f.outbox());
        assertThat(retain(f,Instant.now()).deleted()).isZero();
        jdbc.update("update push_deliveries set result_code='RECEIPT_OK' where outbox_id=?",f.outbox());
        assertThat(retain(f,Instant.now()).deleted()).isZero();
        jdbc.update("update push_deliveries set terminal_at=now()-interval '31 days' where outbox_id=?",f.outbox());
        jdbc.update("update push_outbox set expires_at=now()+interval '1 hour' where outbox_id=?",f.outbox());
        assertThat(retain(f,Instant.now()).deleted()).isZero();
        jdbc.update("update push_outbox set expires_at=now()-interval '9 days' where outbox_id=?",f.outbox());
        jdbc.update("update push_outbox set environment=null,app_id=null where outbox_id=?",f.outbox());
        assertThat(retain(f,Instant.now()).deleted()).isZero();
        jdbc.update("update push_outbox set environment=?,app_id='dio' where outbox_id=?",org.springframework.test.util.ReflectionTestUtils.getField(f.service(),"environment"),f.outbox());
        jdbc.update("delete from invitation_notification_receipts where invite_id=?",f.invite());
        assertThat(retain(f,Instant.now()).deleted()).isZero();
    }
    @Test void retentionSafelySkipsInvalidInvitationReferences() {
        var f=retentionFixture("COMPLETE");
        jdbc.update("update push_outbox set terminal_at=now()-interval '31 days' where outbox_id=?",f.outbox());
        for(String reference:java.util.List.of("not-a-number", "9223372036854775808", "123456789012345678901", "0"+f.invite())) {
            jdbc.update("update push_outbox set reference_id=? where outbox_id=?",reference,f.outbox());
            assertThat(retain(f,Instant.now()).deleted()).isZero();
        }
        jdbc.update("update push_outbox set reference_id=? where outbox_id=?",Long.toString(f.invite()),f.outbox());
        assertThat(retain(f,Instant.now()).deleted()).isEqualTo(1);
    }
    @Test void retentionTerminalTimeTracksActualTransitionsWithoutResettingOnReplay() {
        assertThat(jdbc.queryForObject("select to_regclass('idx_push_outbox_scoped_expiry') is not null",Boolean.class)).isTrue();
        var f=retentionFixture("COMPLETE");delivery(f,"PENDING",null);
        assertThat(jdbc.queryForObject("select terminal_at from push_deliveries where outbox_id=?",Timestamp.class,f.outbox())).isNull();
        jdbc.update("update push_deliveries set status='SENT',result_code='RECEIPT_PENDING' where outbox_id=?",f.outbox());
        assertThat(jdbc.queryForObject("select terminal_at from push_deliveries where outbox_id=?",Timestamp.class,f.outbox())).isNull();
        jdbc.update("update push_deliveries set result_code='RECEIPT_OK' where outbox_id=?",f.outbox());
        Timestamp finished=jdbc.queryForObject("select terminal_at from push_deliveries where outbox_id=?",Timestamp.class,f.outbox());assertThat(finished).isNotNull();
        jdbc.update("update push_deliveries set result_code='RECEIPT_OK' where outbox_id=?",f.outbox());
        assertThat(jdbc.queryForObject("select terminal_at from push_deliveries where outbox_id=?",Timestamp.class,f.outbox())).isEqualTo(finished);
        jdbc.update("update push_deliveries set status='PENDING',result_code=null where outbox_id=?",f.outbox());
        assertThat(jdbc.queryForObject("select terminal_at from push_deliveries where outbox_id=?",Timestamp.class,f.outbox())).isNull();
        jdbc.update("update push_deliveries set status='SENT',result_code=null where outbox_id=?",f.outbox());
        assertThat(jdbc.queryForObject("select terminal_at from push_deliveries where outbox_id=?",Timestamp.class,f.outbox())).isNull();
    }
    @Test void retentionMigrationBackfillsLegacyTerminalRowsConservatively() {
        String schema="retupgrade_"+UUID.randomUUID().toString().replace("-","");
        jdbc.execute("create schema "+schema);
        try {
            new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(st->jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>)connection->{
                try(var stmt=connection.createStatement()) {
                    stmt.execute("set local search_path to "+schema);
                    stmt.execute("create table push_outbox(outbox_id uuid primary key,environment text,app_id text,status text,expires_at timestamptz); create table push_deliveries(outbox_id uuid,installation_id uuid,binding_version bigint,status text,result_code text)");
                    stmt.execute("insert into push_outbox values ('00000000-0000-0000-0000-000000000001','development','dio','COMPLETE',now()-interval '20 days'),('00000000-0000-0000-0000-000000000002','development','dio','PENDING',now()-interval '20 days'); insert into push_deliveries values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',1,'SENT','RECEIPT_OK'),('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004',1,'SENT','RECEIPT_PENDING')");
                    String sql=new String(new org.springframework.core.io.ClassPathResource("db/migration/V26__push_queue_retention.sql").getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
                    stmt.execute(sql);
                    try(var rows=stmt.executeQuery("select count(*) filter(where terminal_at>=now()-interval '1 minute'),count(*) filter(where terminal_at is null) from push_outbox")){rows.next();assertThat(rows.getInt(1)).isEqualTo(1);assertThat(rows.getInt(2)).isEqualTo(1);}
                    try(var rows=stmt.executeQuery("select count(*) filter(where terminal_at>=now()-interval '1 minute'),count(*) filter(where terminal_at is null) from push_deliveries")){rows.next();assertThat(rows.getInt(1)).isEqualTo(1);assertThat(rows.getInt(2)).isEqualTo(1);}
                } catch(java.io.IOException e){throw new RuntimeException(e);}return null;
            }));
        } finally {jdbc.execute("drop schema "+schema+" cascade");}
    }
    @Test void retentionSkipsLockedDeliveryAndRechecksAfterConcurrentAccountSwitch() throws Exception {
        var f=retentionFixture("COMPLETE");delivery(f,"CANCELLED","STALE");
        jdbc.update("update push_outbox set terminal_at=now()-interval '31 days' where outbox_id=?",f.outbox());
        jdbc.update("update push_deliveries set terminal_at=now()-interval '31 days' where outbox_id=?",f.outbox());
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
        try {
            var hold=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(st->{jdbc.queryForObject("select outbox_id from push_deliveries where outbox_id=? for update",UUID.class,f.outbox());entered.countDown();try{if(!release.await(10,TimeUnit.SECONDS))throw new AssertionError();}catch(InterruptedException e){Thread.currentThread().interrupt();throw new RuntimeException(e);}}));
            assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();var result=retain(f,Instant.now());assertThat(result.locked()).isEqualTo(1);assertThat(result.deleted()).isZero();
            release.countDown();hold.get(10,TimeUnit.SECONDS);
            var other=person();var switched=new CountDownLatch(1);var commit=new CountDownLatch(1);
            try {
                var transfer=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(st->{f.service().mutate(other.jwt(),f.installation(),UUID.randomUUID(),f.secret(),1,"BIND",null);switched.countDown();try{if(!commit.await(10,TimeUnit.SECONDS))throw new AssertionError();}catch(InterruptedException e){Thread.currentThread().interrupt();throw new RuntimeException(e);}}));
                assertThat(switched.await(10,TimeUnit.SECONDS)).isTrue();
                var cleanup=pool.submit(()->retain(f,Instant.now()));assertThat(cleanup.get(5,TimeUnit.SECONDS).deleted()).isEqualTo(1);
                commit.countDown();transfer.get(10,TimeUnit.SECONDS);
            } finally {commit.countDown();}
            assertThat(jdbc.queryForObject("select user_id from push_installations where installation_id=?",Long.class,f.installation())).isEqualTo(other.id());
        } finally {release.countDown();pool.shutdownNow();}
    }

    @Test void retentionDoesNotDeleteOrCancelDeliveryWhileActualWorkerSends() throws Exception {
        var f=retentionFixture("PENDING");var actor=person();UUID diary=UUID.randomUUID();
        jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'retention race')",diary,actor.id());
        Long invite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at,retention_until) values(?,?,?,'EMAIL',?,?,now()+interval '7 days') returning invite_id",Long.class,diary,actor.id(),f.recipient().id(),new byte[32],Timestamp.from(Instant.now().plusSeconds(3600)));
        Long notification=jdbc.queryForObject("insert into notifications(user_id,diary_id,notification_type) values(?,?,'DIARY_INVITE') returning notification_id",Long.class,f.recipient().id(),diary);
        jdbc.update("update invitation_notification_receipts set invite_id=? where invite_id=?",invite,f.invite());
        jdbc.update("update push_outbox set reference_id=?,notification_id=?,expires_at=now()+interval '5 seconds' where outbox_id=?",invite.toString(),notification,f.outbox());
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var pool=Executors.newSingleThreadExecutor();
        var gateway=org.mockito.Mockito.mock(com.f106.DIO.push.service.ExpoPushGateway.class);
        org.mockito.Mockito.when(gateway.sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyString())).thenAnswer(call->{entered.countDown();if(!release.await(10,TimeUnit.SECONDS))throw new AssertionError();return new com.f106.DIO.push.service.ExpoPushGateway.Result(true,"ret-ticket",null);});
        try {
            var future=pool.submit(()->new com.f106.DIO.push.service.PushDeliveryWorker(jdbc,transactionManager,f.service(),gateway,true).poll());
            assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();Thread.sleep(5200);
            assertThat(retain(f,Instant.now()).deleted()).isZero();
            release.countDown();future.get(10,TimeUnit.SECONDS);
            assertThat(jdbc.queryForObject("select result_code from push_deliveries where outbox_id=?",String.class,f.outbox())).isEqualTo("RECEIPT_PENDING");
            assertThat(retain(f,Instant.now().plusSeconds(31*86400L)).deleted()).isZero();
        } finally {release.countDown();pool.shutdownNow();}
    }

    @Test void retentionKeepsReceiptWhileActualWorkerIsCheckingIt() throws Exception {
        var f=retentionFixture("COMPLETE");delivery(f,"SENT","RECEIPT_PENDING");
        jdbc.update("update push_outbox set terminal_at=now()-interval '31 days' where outbox_id=?",f.outbox());
        jdbc.update("update push_deliveries set provider_ticket_id='ret-ticket',accepted_at=now(),next_attempt_at=now()-interval '1 second' where outbox_id=?",f.outbox());
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var pool=Executors.newSingleThreadExecutor();
        var gateway=org.mockito.Mockito.mock(com.f106.DIO.push.service.ExpoPushGateway.class);
        org.mockito.Mockito.when(gateway.receipt("ret-ticket")).thenAnswer(call->{entered.countDown();if(!release.await(10,TimeUnit.SECONDS))throw new AssertionError();return new com.f106.DIO.push.service.ExpoPushGateway.Receipt(true,true,null);});
        try {
            var future=pool.submit(()->new com.f106.DIO.push.service.PushDeliveryWorker(jdbc,transactionManager,f.service(),gateway,true).poll());
            assertThat(entered.await(10,TimeUnit.SECONDS)).isTrue();assertThat(retain(f,Instant.now()).deleted()).isZero();
            release.countDown();future.get(10,TimeUnit.SECONDS);
            assertThat(jdbc.queryForObject("select result_code from push_deliveries where outbox_id=?",String.class,f.outbox())).isEqualTo("RECEIPT_OK");
            assertThat(retain(f,Instant.now()).deleted()).isZero();
            assertThat(retain(f,Instant.now().plusSeconds(31*86400L)).deleted()).isEqualTo(1);
        } finally {release.countDown();pool.shutdownNow();}
    }

    @Test void disabledWorkerAndOtherEnvironmentNeverConsumeOutbox() {
        var recipient=person();UUID prod=UUID.randomUUID(),dev=UUID.randomUUID();
        Long notification=jdbc.queryForObject("insert into notifications(user_id,notification_type) values(?,'DIARY_INVITE') returning notification_id",Long.class,recipient.id());
        for(var pair:java.util.Map.of(prod,"production",dev,"development").entrySet())jdbc.update("insert into push_outbox(outbox_id,event_key,notification_id,recipient_user_id,event_type,reference_id,status,created_at,expires_at,environment,app_id) values(?,?,?,?,?,'1','PENDING',now(),?,?, 'dio')",pair.getKey(),"scope:"+pair.getKey(),notification,recipient.id(),"DIARY_INVITE",Timestamp.from(Instant.now().plusSeconds(3600)),pair.getValue());
        var fake=org.mockito.Mockito.mock(com.f106.DIO.push.service.ExpoPushGateway.class);
        new com.f106.DIO.push.service.PushDeliveryWorker(jdbc,transactionManager,push,fake,false).poll();
        assertThat(jdbc.queryForObject("select status from push_outbox where outbox_id=?",String.class,dev)).isEqualTo("PENDING");
        new com.f106.DIO.push.service.PushDeliveryWorker(jdbc,transactionManager,push,fake,true).poll();
        assertThat(jdbc.queryForObject("select status from push_outbox where outbox_id=?",String.class,prod)).isEqualTo("PENDING");
        org.mockito.Mockito.verifyNoInteractions(fake);
    }

    @Test void workerCancelsInviteForExistingMemberOrDeletedDiary() throws Exception {
        for(boolean joined:new boolean[]{true,false}){
            var recipient=person();var actor=person();UUID installation=UUID.randomUUID(),diary=UUID.randomUUID(),outbox=UUID.randomUUID();
            push.register(recipient.jwt(),installation,UUID.randomUUID(),input("ExpoPushToken[stale"+installation+"]"));
            jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'stale QA')",diary,actor.id());
            Long invite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at,retention_until) values(?,?,?,'EMAIL',?,?,now()+interval '7 days') returning invite_id",Long.class,diary,actor.id(),recipient.id(),new byte[32],Timestamp.from(Instant.now().plusSeconds(3600)));
            Long notification=jdbc.queryForObject("insert into notifications(user_id,diary_id,notification_type) values(?,?,'DIARY_INVITE') returning notification_id",Long.class,recipient.id(),diary);
            jdbc.update("insert into push_outbox(outbox_id,event_key,notification_id,recipient_user_id,event_type,reference_id,status,created_at,expires_at,environment,app_id) values(?,?,?,?,?,?,'PENDING',now(),?,'development','dio')",outbox,"stale:"+outbox,notification,recipient.id(),"DIARY_INVITE",invite.toString(),Timestamp.from(Instant.now().plusSeconds(3600)));
            if(joined)jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values(?,?,'EDITOR','#CED9EE')",diary,recipient.id());
            else jdbc.update("update diaries set deleted_at=now() where diary_id=?",diary);
            var gateway=org.mockito.Mockito.mock(com.f106.DIO.push.service.ExpoPushGateway.class);
            new com.f106.DIO.push.service.PushDeliveryWorker(jdbc,transactionManager,push,gateway,true).poll();
            assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,outbox)).isEqualTo("CANCELLED");
            org.mockito.Mockito.verify(gateway,org.mockito.Mockito.never()).sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(invite.toString()));
        }
    }

    @Test void workerRechecksSessionExpiryAfterNotificationLockWait() throws Exception {
        var recipient=person();var actor=person();UUID installation=UUID.randomUUID(),diary=UUID.randomUUID(),outbox=UUID.randomUUID();
        push.register(recipient.jwt(),installation,UUID.randomUUID(),input("ExpoPushToken[expiry"+installation+"]"));
        jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'expiry QA')",diary,actor.id());
        Long invite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at,retention_until) values(?,?,?,'EMAIL',?,?,now()+interval '7 days') returning invite_id",Long.class,diary,actor.id(),recipient.id(),new byte[32],Timestamp.from(Instant.now().plusSeconds(3600)));
        Long notification=jdbc.queryForObject("insert into notifications(user_id,diary_id,notification_type) values(?,?,'DIARY_INVITE') returning notification_id",Long.class,recipient.id(),diary);
        jdbc.update("insert into push_outbox(outbox_id,event_key,notification_id,recipient_user_id,event_type,reference_id,status,created_at,expires_at,environment,app_id) values(?,?,?,?,?,?,'PENDING',now(),?,'development','dio')",outbox,"expiry:"+outbox,notification,recipient.id(),"DIARY_INVITE",invite.toString(),Timestamp.from(Instant.now().plusSeconds(3600)));
        jdbc.update("update refresh_tokens set expires_at=? where session_id=?",Timestamp.from(Instant.now().plusSeconds(2)),recipient.sid());
        var gateway=org.mockito.Mockito.mock(com.f106.DIO.push.service.ExpoPushGateway.class);
        var worker=new com.f106.DIO.push.service.PushDeliveryWorker(jdbc,transactionManager,push,gateway,true);
        var pool=Executors.newFixedThreadPool(2);var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
        try {
            var holder=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{
                jdbc.queryForObject("select notification_id from notifications where notification_id=? for update",Long.class,notification);locked.countDown();
                try{if(!release.await(10,TimeUnit.SECONDS))throw new AssertionError("release timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;
            }));
            assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();var running=pool.submit(worker::poll);
            assertThatThrownBy(()->running.get(200,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            Thread.sleep(2300);release.countDown();holder.get(10,TimeUnit.SECONDS);running.get(20,TimeUnit.SECONDS);
            assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,outbox)).isEqualTo("CANCELLED");
            org.mockito.Mockito.verify(gateway,org.mockito.Mockito.never()).sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(invite.toString()));
        } finally {release.countDown();pool.shutdownNow();}
    }

    @Test void workerRetriesTransientFailureAndSendsOnlyOnce() throws Exception {
        var recipient=person();var actor=person();UUID installation=UUID.randomUUID(),diary=UUID.randomUUID(),outbox=UUID.randomUUID();
        var registered=push.register(recipient.jwt(),installation,UUID.randomUUID(),input("ExpoPushToken[worker"+installation+"]"));
        jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'worker QA')",diary,actor.id());
        Long invite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at,retention_until) values(?,?,?,'EMAIL',?,?,now()+interval '7 days') returning invite_id",Long.class,diary,actor.id(),recipient.id(),new byte[32],Timestamp.from(Instant.now().plusSeconds(3600)));
        Long notification=jdbc.queryForObject("insert into notifications(user_id,diary_id,notification_type) values(?,?,'DIARY_INVITE') returning notification_id",Long.class,recipient.id(),diary);
        jdbc.update("insert into push_outbox(outbox_id,event_key,notification_id,recipient_user_id,event_type,reference_id,status,created_at,expires_at,environment,app_id) values(?,?,?,?,?,?,'PENDING',now(),?,'development','dio')",outbox,"qa:"+outbox,notification,recipient.id(),"DIARY_INVITE",invite.toString(),Timestamp.from(Instant.now().plusSeconds(3600)));
        var gateway=org.mockito.Mockito.mock(com.f106.DIO.push.service.ExpoPushGateway.class);
        org.mockito.Mockito.when(gateway.sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(invite.toString())))
            .thenReturn(new com.f106.DIO.push.service.ExpoPushGateway.Result(false,null,"HTTP_503"),new com.f106.DIO.push.service.ExpoPushGateway.Result(true,"fake-ticket",null));
        var worker=new com.f106.DIO.push.service.PushDeliveryWorker(jdbc,transactionManager,push,gateway,true);
        worker.poll();assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,outbox)).isEqualTo("PENDING");
        worker.poll();org.mockito.Mockito.verify(gateway,org.mockito.Mockito.times(1)).sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(invite.toString()));
        jdbc.update("update push_deliveries set next_attempt_at=now()-interval '1 second' where outbox_id=?",outbox);
        var pool=Executors.newFixedThreadPool(2);try {var first=pool.submit(worker::poll);var second=pool.submit(worker::poll);first.get(20,TimeUnit.SECONDS);second.get(20,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
        assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,outbox)).isEqualTo("SENT");
        assertThat(jdbc.queryForObject("select attempt_count from push_deliveries where outbox_id=?",Integer.class,outbox)).isEqualTo(2);
        // 발송 TTL이 지났어도 Expo 접수 후 receipt 확인은 별도 기간에 계속된다.
        jdbc.update("update push_outbox set created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' where outbox_id=?",outbox);
        org.mockito.Mockito.when(gateway.receipt("fake-ticket")).thenReturn(new com.f106.DIO.push.service.ExpoPushGateway.Receipt(true,true,null));
        jdbc.update("update push_deliveries set next_attempt_at=now()-interval '1 second' where outbox_id=?",outbox);
        worker.poll();assertThat(jdbc.queryForObject("select result_code from push_deliveries where outbox_id=?",String.class,outbox)).isEqualTo("RECEIPT_OK");
        // 늦게 도착한 이전 토큰의 실패 receipt는 갱신된 토큰을 비활성화하지 않는다.
        push.mutate(recipient.jwt(),installation,UUID.randomUUID(),registered.installationSecret(),1,"UPDATE",input("ExpoPushToken[new"+installation+"]"));
        jdbc.update("update push_deliveries set result_code='RECEIPT_PENDING',provider_ticket_id='bad-ticket',next_attempt_at=now()-interval '1 second' where outbox_id=?",outbox);
        org.mockito.Mockito.when(gateway.receipt("bad-ticket")).thenReturn(new com.f106.DIO.push.service.ExpoPushGateway.Receipt(true,false,"DeviceNotRegistered"));
        worker.poll();assertThat(jdbc.queryForObject("select enabled from push_installations where installation_id=?",Boolean.class,installation)).isTrue();
        assertThat(jdbc.queryForObject("select result_code from push_deliveries where outbox_id=?",String.class,outbox)).isEqualTo("DeviceNotRegistered");
        org.mockito.Mockito.verify(gateway,org.mockito.Mockito.times(2)).sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(invite.toString()));
    }

    @Test void fanOutFailureSkipsOnlyFailedOutboxAndContinuesDelivery() throws Exception {
        var recipient=person();var actor=person();UUID installation=UUID.randomUUID(), first=UUID.randomUUID(),second=UUID.randomUUID(),diary=UUID.randomUUID();
        String scope="fan-"+UUID.randomUUID().toString().replace("-","").substring(0,16);
        var isolatedPush=new PushInstallationService(jdbc,sessionLock,Base64.getEncoder().encodeToString(new byte[32]),scope,"dio");
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(st->isolatedPush.register(recipient.jwt(),installation,UUID.randomUUID(),input("ExpoPushToken[fan"+installation+"]")));
        jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'fan QA')",diary,actor.id());
        Long invite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at,retention_until) values(?,?,?,'EMAIL',?,?,now()+interval '7 days') returning invite_id",Long.class,diary,actor.id(),recipient.id(),new byte[32],Timestamp.from(Instant.now().plusSeconds(3600)));
        Long notification=jdbc.queryForObject("insert into notifications(user_id,diary_id,notification_type) values(?,?,'DIARY_INVITE') returning notification_id",Long.class,recipient.id(),diary);
        for(UUID outbox:List.of(first,second))jdbc.update("insert into push_outbox(outbox_id,event_key,notification_id,recipient_user_id,event_type,reference_id,status,created_at,expires_at,environment,app_id) values(?,?,?,?,?,?,'PENDING',?,?,?,'dio')",outbox,"qa:"+outbox,notification,recipient.id(),"DIARY_INVITE",invite.toString(),Timestamp.from(Instant.now().minusSeconds(outbox.equals(first)?20:10)),Timestamp.from(Instant.now().plusSeconds(3600)),scope);
        var failOnce=new java.util.concurrent.atomic.AtomicBoolean(true);
        JdbcTemplate faulty=new JdbcTemplate(jdbc.getDataSource()) {
            @Override public int update(String sql,Object... args) {
                if(sql.startsWith("insert into push_deliveries") && first.equals(args[0]) && failOnce.getAndSet(false))throw new org.springframework.dao.DataAccessResourceFailureException("simulated");
                return super.update(sql,args);
            }
        };
        var gateway=org.mockito.Mockito.mock(com.f106.DIO.push.service.ExpoPushGateway.class);
        org.mockito.Mockito.when(gateway.sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyString())).thenReturn(new com.f106.DIO.push.service.ExpoPushGateway.Result(true,"ticket",null));
        var worker=new com.f106.DIO.push.service.PushDeliveryWorker(faulty,transactionManager,isolatedPush,gateway,true);
        worker.poll();
        assertThat(jdbc.queryForObject("select status from push_outbox where outbox_id=?",String.class,first)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,second)).isEqualTo("SENT");
        worker.poll();
        assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,first)).isEqualTo("SENT");
    }

    @Test void deliveryProcessingExceptionDefersOneItemAndContinuesToNext() throws Exception {
        var recipient=person(); var actor=person(); UUID installation=UUID.randomUUID(), first=UUID.randomUUID(), second=UUID.randomUUID(), diary=UUID.randomUUID(), untouched=UUID.randomUUID();
        jdbc.update("insert into push_outbox(outbox_id,event_key,recipient_user_id,event_type,status,created_at,expires_at,environment,app_id) values(?,?,?,'TEST','PENDING',now(),now()+interval '1 hour','development','dio')",untouched,"qa:"+untouched,recipient.id());
        String scope="qa-"+UUID.randomUUID().toString().replace("-","").substring(0,16);
        var isolatedPush=new PushInstallationService(jdbc,sessionLock,Base64.getEncoder().encodeToString(new byte[32]),scope,"dio");
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(st->isolatedPush.register(recipient.jwt(),installation,UUID.randomUUID(),input("ExpoPushToken[poison"+installation+"]")));
        jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,?,'queue QA')",diary,actor.id());
        Long invite=jdbc.queryForObject("insert into diary_invites(diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at,retention_until) values(?,?,?,'EMAIL',?,?,now()+interval '7 days') returning invite_id",Long.class,diary,actor.id(),recipient.id(),new byte[32],Timestamp.from(Instant.now().plusSeconds(3600)));
        Long notification=jdbc.queryForObject("insert into notifications(user_id,diary_id,notification_type) values(?,?,'DIARY_INVITE') returning notification_id",Long.class,recipient.id(),diary);
        for(UUID outbox:List.of(first,second)) {
            jdbc.update("insert into push_outbox(outbox_id,event_key,notification_id,recipient_user_id,event_type,reference_id,status,created_at,expires_at,environment,app_id) values(?,?,?,?,?,?,'COMPLETE',now(),?,?,'dio')",outbox,"qa:"+outbox,notification,recipient.id(),"DIARY_INVITE",invite.toString(),Timestamp.from(Instant.now().plusSeconds(3600)),scope);
            jdbc.update("insert into push_deliveries(outbox_id,installation_id,binding_version,token_version,status,next_attempt_at) values(?,?,1,1,'PENDING',?)",outbox,installation,Timestamp.from(Instant.now().minusSeconds(outbox.equals(first)?20:10)));
        }
        var failOnce=new java.util.concurrent.atomic.AtomicBoolean(true);
        JdbcTemplate faulty=new JdbcTemplate(jdbc.getDataSource()) {
            @Override public <T> List<T> query(String sql,org.springframework.jdbc.core.RowMapper<T> mapper,Object... args) {
                if(sql.startsWith("select user_id,session_id from push_installations") && args.length==1 && installation.equals(args[0]) && failOnce.getAndSet(false)) throw new org.springframework.dao.DataAccessResourceFailureException("simulated");
                return super.query(sql,mapper,args);
            }
        };
        var gateway=org.mockito.Mockito.mock(com.f106.DIO.push.service.ExpoPushGateway.class);
        org.mockito.Mockito.when(gateway.sendInvitation(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyString())).thenReturn(new com.f106.DIO.push.service.ExpoPushGateway.Result(true,"ticket",null));
        new com.f106.DIO.push.service.PushDeliveryWorker(faulty,transactionManager,isolatedPush,gateway,true).poll();
        assertThat(jdbc.queryForObject("select result_code from push_deliveries where outbox_id=?",String.class,first)).isEqualTo("PROCESSING_ERROR");
        assertThat(jdbc.queryForObject("select attempt_count from push_deliveries where outbox_id=?",Integer.class,first)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,second)).isEqualTo("SENT");
        assertThat(jdbc.queryForObject("select status from push_outbox where outbox_id=?",String.class,untouched)).isEqualTo("PENDING");
        jdbc.update("delete from push_outbox where outbox_id=?",untouched);
    }

    @Test void lostRegistrationResponseRecoversOnlyForSameUserAndDisabledInstallation() {
        var original=person();UUID id=UUID.randomUUID(), request=UUID.randomUUID();var settings=input("ExpoPushToken[recover"+id+"]");
        var registered=push.register(original.jwt(),id,request,settings);
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(st->revoker.revokeAll(original.id(),Instant.now()));
        Instant now=Instant.now();var refresh=sessions.saveAndFlush(new RefreshToken(original.id(),UUID.randomUUID().toString().replace("-","")+"a".repeat(32),"new",now,now.plusSeconds(3600)));
        var replacement=tokens.decode(tokens.issue(original.id(),refresh.getSessionId(),now,now.plusSeconds(300)));
        var restored=push.register(replacement,id,request,settings);
        assertThat(restored.installationSecret()).isEqualTo(registered.installationSecret());
        var other=person();assertThatThrownBy(()->push.register(other.jwt(),id,request,settings)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->push.register(replacement,id,UUID.randomUUID(),settings)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->push.inspectBinding(other.jwt(),id,"wrong-secret")).isInstanceOf(RuntimeException.class);
        var current=push.inspectBinding(other.jwt(),id,restored.installationSecret());
        push.mutate(other.jwt(),id,UUID.randomUUID(),restored.installationSecret(),Long.parseLong(current.bindingVersion()),"BIND",null);
        assertThatThrownBy(()->push.register(replacement,id,request,settings)).isInstanceOf(RuntimeException.class);
    }
    @Test void lostResponseRecoversForSameUserEvenIfOldSessionIsStillActive() {
        var original=person();UUID id=UUID.randomUUID(),request=UUID.randomUUID();var settings=input("ExpoPushToken[activeRecover"+id+"]");
        var registered=push.register(original.jwt(),id,request,settings);
        Instant now=Instant.now();var refresh=sessions.saveAndFlush(new RefreshToken(original.id(),UUID.randomUUID().toString().replace("-","")+"d".repeat(32),"new",now,now.plusSeconds(3600)));
        var replacement=tokens.decode(tokens.issue(original.id(),refresh.getSessionId(),now,now.plusSeconds(300)));
        var recovered=push.register(replacement,id,request,settings);
        assertThat(recovered.installationSecret()).isEqualTo(registered.installationSecret());
        assertThat(jdbc.queryForObject("select enabled from push_installations where installation_id=?",Boolean.class,id)).isTrue();
        assertThatThrownBy(()->push.register(person().jwt(),id,request,settings)).isInstanceOf(RuntimeException.class);
    }

    @Test void lostResponseRecoversWhenOldSessionExpiredBeforeCleanup() {
        var original=person();UUID id=UUID.randomUUID(),request=UUID.randomUUID();var settings=input("ExpoPushToken[expired"+id+"]");
        var registered=push.register(original.jwt(),id,request,settings);
        jdbc.update("update refresh_tokens set expires_at=? where session_id=?",Timestamp.from(Instant.now().minusSeconds(1)),original.sid());
        Instant now=Instant.now();var refresh=sessions.saveAndFlush(new RefreshToken(original.id(),UUID.randomUUID().toString().replace("-","")+"c".repeat(32),"new",now,now.plusSeconds(3600)));
        var replacement=tokens.decode(tokens.issue(original.id(),refresh.getSessionId(),now,now.plusSeconds(300)));
        var recovered=push.register(replacement,id,request,settings);
        assertThat(recovered.installationSecret()).isEqualTo(registered.installationSecret());
        assertThat(jdbc.queryForObject("select enabled from push_installations where installation_id=?",Boolean.class,id)).isTrue();
    }

    @Test void reinstallReclaimsOnlySameUsersToken() {
        var active=person();UUID previous=UUID.randomUUID(),next=UUID.randomUUID();String activeToken="ExpoPushToken[activeReinstall"+previous+"]";
        push.register(active.jwt(),previous,UUID.randomUUID(),input(activeToken));
        var otherActive=person();assertThatThrownBy(()->push.register(otherActive.jwt(),next,UUID.randomUUID(),input(activeToken))).isInstanceOf(RuntimeException.class);
        push.register(active.jwt(),next,UUID.randomUUID(),input(activeToken));
        assertThat(jdbc.queryForObject("select enabled from push_installations where installation_id=?",Boolean.class,previous)).isFalse();
        assertThat(jdbc.queryForObject("select token_hash is null from push_installations where installation_id=?",Boolean.class,previous)).isTrue();
        var original=person();UUID old=UUID.randomUUID(),fresh=UUID.randomUUID();String token="ExpoPushToken[reinstall"+old+"]";
        push.register(original.jwt(),old,UUID.randomUUID(),input(token));
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(st->revoker.revokeAll(original.id(),Instant.now()));
        var other=person();assertThatThrownBy(()->push.register(other.jwt(),fresh,UUID.randomUUID(),input(token))).isInstanceOf(RuntimeException.class);
        Instant now=Instant.now();var refresh=sessions.saveAndFlush(new RefreshToken(original.id(),UUID.randomUUID().toString().replace("-","")+"b".repeat(32),"new",now,now.plusSeconds(3600)));
        var replacement=tokens.decode(tokens.issue(original.id(),refresh.getSessionId(),now,now.plusSeconds(300)));
        push.register(replacement,fresh,UUID.randomUUID(),input(token));
        assertThat(jdbc.queryForObject("select token_hash is null from push_installations where installation_id=?",Boolean.class,old)).isTrue();
        assertThat(jdbc.queryForObject("select enabled from push_installations where installation_id=?",Boolean.class,fresh)).isTrue();
    }

    @Test void actualWithdrawalDisablesPushAndDeletesSession() {
        var person=person(); UUID id=UUID.randomUUID();
        push.register(person.jwt(),id,UUID.randomUUID(),input("ExpoPushToken[withdraw"+id+"]"));
        withdrawalService.withdraw(person.id());
        assertThat(jdbc.queryForObject("select enabled from push_installations where installation_id=?",Boolean.class,id)).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from refresh_tokens where user_id=?",Long.class,person.id())).isZero();
        assertThatThrownBy(()->push.register(person.jwt(),UUID.randomUUID(),UUID.randomUUID(),input("ExpoPushToken[stale"+id+"]"))).isInstanceOf(RuntimeException.class);
    }

    @Test void actualWithdrawalAndRegistrationSerializeInBothOrders() throws Exception {
        for(boolean withdrawalFirst:new boolean[]{false,true}) {
            var person=person();UUID id=UUID.randomUUID();var ready=new CountDownLatch(1);var release=new CountDownLatch(1);
            var pool=Executors.newFixedThreadPool(2);
            try {
                var held=pool.submit(()->new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status->{
                    if(withdrawalFirst) withdrawalService.withdraw(person.id());
                    else push.register(person.jwt(),id,UUID.randomUUID(),input("ExpoPushToken[race"+id+"]"));
                    ready.countDown();try {if(!release.await(15,TimeUnit.SECONDS))throw new AssertionError("release timeout");}catch(InterruptedException e){throw new RuntimeException(e);}return null;
                }));
                assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();
                var contender=pool.submit(()->{if(withdrawalFirst){try{push.register(person.jwt(),id,UUID.randomUUID(),input("ExpoPushToken[race"+id+"]"));return false;}catch(RuntimeException expected){return true;}}withdrawalService.withdraw(person.id());return true;});
                assertThatThrownBy(()->contender.get(200,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                release.countDown();held.get(15,TimeUnit.SECONDS);assertThat(contender.get(15,TimeUnit.SECONDS)).isTrue();
                assertThat(jdbc.queryForObject("select count(*) from push_installations where installation_id=? and enabled",Long.class,id)).isZero();
            } finally {release.countDown();pool.shutdownNow();}
        }
    }

    @Test void passwordChangeAndTokenUpdateRaceRevokeInstallation() throws Exception {
        var a=person();var user=users.findById(a.id()).orElseThrow();
        var accounts=org.springframework.test.util.ReflectionTestUtils.getField(login,"accounts");
        var encoder=(org.springframework.security.crypto.password.PasswordEncoder)org.springframework.test.util.ReflectionTestUtils.getField(login,"passwords");
        ((com.f106.DIO.auth.repository.EmailAuthProviderRepository)accounts).saveAndFlush(new com.f106.DIO.auth.domain.EmailAuthProvider(a.id(),user.getEmail(),encoder.encode("DioMember123!"),Instant.now()));
        UUID id=UUID.randomUUID();var initial=push.register(a.jwt(),id,UUID.randomUUID(),input("ExpoPushToken[pw"+id+"]"));
        var service=org.springframework.test.util.ReflectionTestUtils.getField(this,"passwordChanges");
        var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try {
            var changed=pool.submit(()->{start.await();((com.f106.DIO.auth.service.PasswordChangeService)service).change(a.jwt(),new com.f106.DIO.auth.dto.PasswordChangeRequest("DioMember123!","ChangedDio123!"),"127.0.0.1");return null;});
            var updated=pool.submit(()->{start.await();try {push.mutate(a.jwt(),id,UUID.randomUUID(),initial.installationSecret(),1,"UPDATE",input("ExpoPushToken[pw2"+id+"]"));}catch(com.f106.DIO.auth.exception.LoginException expected){} return null;});
            start.countDown();changed.get(30,TimeUnit.SECONDS);updated.get(30,TimeUnit.SECONDS);
            assertThat(jdbc.queryForObject("select enabled=false and disabled_at is not null from push_installations where installation_id=?",Boolean.class,id)).isTrue();
            assertThat(sessions.findBySessionId(a.sid()).orElseThrow().getRevokedAt()).isNotNull();
        } finally {pool.shutdownNow();}
    }
    @Autowired com.f106.DIO.auth.service.PasswordChangeService passwordChanges;

    @Test void databaseGuardRejectsWrongDisposableMarker() {
        var env=new HashMap<>(System.getenv());
        String actual=env.get("DIO_PUSH_GUARD");env.put("DIO_PUSH_GUARD",actual.equals("0".repeat(32))?"1".repeat(32):"0".repeat(32));
        assertThatThrownBy(()->PushTestDatabaseGuard.verify(env)).isInstanceOf(IllegalStateException.class).hasMessageContaining("marker");
    }

    @Test void deletingTransferredOwnerCascadesDeliveryButPreservesOriginalOutbox() {
        var a=person();var b=person();UUID installation=UUID.randomUUID(),outbox=UUID.randomUUID();
        var reg=push.register(a.jwt(),installation,UUID.randomUUID(),input("ExpoPushToken[delete"+installation+"]"));
        jdbc.update("insert into push_outbox(outbox_id,event_key,recipient_user_id,event_type,status,created_at,expires_at) values(?,?,?,'TEST','PENDING',now(),now()+interval '1 hour')",outbox,outbox.toString(),a.id());
        jdbc.update("insert into push_deliveries(outbox_id,installation_id,binding_version,token_version,status) values(?,?,1,1,'PENDING')",outbox,installation);
        push.mutate(b.jwt(),installation,UUID.randomUUID(),reg.installationSecret(),1,"BIND",null);
        assertThat(jdbc.queryForObject("select status from push_deliveries where outbox_id=?",String.class,outbox)).isEqualTo("CANCELLED");
        jdbc.update("delete from refresh_tokens where user_id=?",b.id());
        jdbc.update("delete from users where user_id=?",b.id());
        assertThat(jdbc.queryForObject("select count(*) from push_installations where installation_id=?",Long.class,installation)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from push_deliveries where outbox_id=?",Long.class,outbox)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from push_outbox where outbox_id=?",Long.class,outbox)).isEqualTo(1);
    }

    @Test void registrationRetryReturnsCurrentVersionsAfterUpdateAndUnbind() {
        var a=person();UUID id=UUID.randomUUID(),request=UUID.randomUUID();var settings=input("ExpoPushToken[retry"+id+"]");
        var initial=push.register(a.jwt(),id,request,settings);
        push.mutate(a.jwt(),id,UUID.randomUUID(),initial.installationSecret(),1,"UPDATE",input("ExpoPushToken[updated"+id+"]"));
        var updated=push.register(a.jwt(),id,request,settings);
        assertThat(updated.installationSecret()).isEqualTo(initial.installationSecret());assertThat(updated.bindingVersion()).isEqualTo("1");assertThat(updated.tokenVersion()).isEqualTo("2");
        push.mutate(a.jwt(),id,UUID.randomUUID(),initial.installationSecret(),1,"UNBIND",null);
        var unbound=push.register(a.jwt(),id,request,settings);
        assertThat(unbound.installationSecret()).isEqualTo(initial.installationSecret());assertThat(unbound.bindingVersion()).isEqualTo("2");assertThat(unbound.tokenVersion()).isEqualTo("2");
    }

}
