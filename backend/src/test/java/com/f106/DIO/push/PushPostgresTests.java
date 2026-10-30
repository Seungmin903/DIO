package com.f106.DIO.push;

import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.service.EmailLoginService;
import com.f106.DIO.push.service.PushInstallationService;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
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
            runPg(bin,"pg_dump.exe",password,"-h","127.0.0.1","-p",String.valueOf(uri.getPort()),"-U","postgres","-Fc","-f",archive.toString(),uri.getPath().substring(1));
            runPg(bin,"createdb.exe",password,"-h","127.0.0.1","-p",String.valueOf(uri.getPort()),"-U","postgres",restore);created=true;
            runPg(bin,"pg_restore.exe",password,"-h","127.0.0.1","-p",String.valueOf(uri.getPort()),"-U","postgres","--no-owner","--no-privileges","-d",restore,archive.toString());
            var source=new org.springframework.jdbc.datasource.DriverManagerDataSource("jdbc:postgresql://127.0.0.1:"+uri.getPort()+"/"+restore,"postgres",password);
            var restored=new org.springframework.jdbc.core.JdbcTemplate(source);
            byte[] ciphertext=restored.queryForObject("select token_ciphertext from push_installations where installation_id=?",byte[].class,id);
            String retained=Base64.getEncoder().encodeToString(new byte[32]);var keys=new com.f106.DIO.push.security.PushKeyring("legacy",Map.of("legacy",retained));
            byte[] aad=("development|dio|"+id+"|token").getBytes(java.nio.charset.StandardCharsets.UTF_8);
            assertThat(new String(keys.decrypt("legacy",ciphertext,aad),java.nio.charset.StandardCharsets.UTF_8)).isEqualTo(token);
            var wrong=new byte[32];wrong[0]=1;var incorrect=new com.f106.DIO.push.security.PushKeyring("legacy",Map.of("legacy",Base64.getEncoder().encodeToString(wrong)));
            assertThatThrownBy(()->incorrect.decrypt("legacy",ciphertext,aad)).isInstanceOf(IllegalArgumentException.class);
        } finally {
            if(created)runPg(bin,"dropdb.exe",password,"-h","127.0.0.1","-p",String.valueOf(uri.getPort()),"-U","postgres",restore);
            java.nio.file.Files.deleteIfExists(archive);
        }
    }
    private static void runPg(String bin,String program,String password,String...args) throws Exception {
        var command=new ArrayList<String>();command.add(java.nio.file.Path.of(bin,program).toString());command.addAll(Arrays.asList(args));
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
        } finally {jdbc.execute("drop schema "+schema+" cascade");}
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

}
