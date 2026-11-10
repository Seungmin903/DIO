package com.f106.DIO.user.integration;

import com.f106.DIO.user.domain.*;
import com.f106.DIO.user.repository.*;
import com.f106.DIO.user.service.UserTermsUpdateService;
import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.service.EmailLoginService;
import com.f106.DIO.auth.dto.LoginRequest;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.test.context.jdbc.Sql("/push-session-h2.sql")
@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:user-terms-update;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.service-terms-version=v2",
    "dio.signup.photos.storage=local","dio.signup.photos.local-directory=build/test-terms-photos/${org.gradle.test.worker:0}",
    "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    "SHARING_INVITE_BASE_URL=https://dio.test/invite/"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class UserTermsUpdateTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired TermsAgreementRepository terms;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired EmailLoginService login;
    @Autowired UserTermsUpdateService updates;
    @Autowired com.f106.DIO.user.service.UserTermsQueryService queries;
    record Actor(long id,String token){}
    Actor actor(){
        var user=users.saveAndFlush(new User(UUID.randomUUID()+"@example.com","약관테스트",Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),new BCryptPasswordEncoder(4).encode("DioMember123!"),Instant.now()));
        return new Actor(user.getUserId(),login.login(new LoginRequest(user.getEmail(),"DioMember123!","terms-test"),"127.0.0.1").accessToken());
    }
    TermsAgreement entry(long user,String type,String version){
        var key=new TermsAgreement.Key();key.userId=user;key.termsType=type;key.termsVersion=version;
        return terms.findById(key).orElseThrow();
    }
    @Test void queryReturnsFourMissingChoicesWithoutWritingOrReadingAnotherUser()throws Exception{
        var actor=actor();var other=actor();
        updates.update(other.id(),TermsType.AD_EMAIL,"v1",true);
        var count=terms.count();
        mvc.perform(get("/api/v1/me/terms").param("userId",Long.toString(other.id()))
            .header("Authorization","Bearer "+actor.token()))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("agreements.length()").value(4))
            .andExpect(jsonPath("agreements[0].termsType").value("MARKETING_PRIVACY"))
            .andExpect(jsonPath("agreements[1].termsType").value("AD_EMAIL"))
            .andExpect(jsonPath("agreements[2].termsType").value("AD_PUSH"))
            .andExpect(jsonPath("agreements[3].termsType").value("AD_NIGHT_PUSH"))
            .andExpect(jsonPath("agreements[*].agreed",org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is(false))))
            .andExpect(jsonPath("agreements[*].termsVersion",org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("v1"))))
            .andExpect(jsonPath("agreements[*].recordStatus",org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("NOT_RECORDED"))))
            .andExpect(jsonPath("agreements[0].agreedAt").value(org.hamcrest.Matchers.nullValue()));
        assertThat(terms.count()).isEqualTo(count);
        assertThat(entry(other.id(),"AD_EMAIL","v1").isAgreed()).isTrue();
    }
    @Test void queryReturnsCurrentAgreementsAndWithdrawalsIndependently()throws Exception{
        var actor=actor();var changed=Instant.parse("2026-01-01T00:00:00Z");
        var types=new TermsType[]{TermsType.MARKETING_PRIVACY,TermsType.AD_EMAIL,TermsType.AD_PUSH,TermsType.AD_NIGHT_PUSH};
        for(int i=0;i<types.length;i++)terms.saveAndFlush(new TermsAgreement(actor.id(),types[i].name(),"v1",i%2==0,changed));
        mvc.perform(get("/api/v1/me/terms").header("Authorization","Bearer "+actor.token()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("agreements[0].agreed").value(true))
            .andExpect(jsonPath("agreements[1].agreed").value(false))
            .andExpect(jsonPath("agreements[2].agreed").value(true))
            .andExpect(jsonPath("agreements[3].agreed").value(false))
            .andExpect(jsonPath("agreements[*].agreedAt",org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is(changed.toString()))))
            .andExpect(jsonPath("agreements[*].recordStatus",org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("CURRENT_VERSION"))));
        assertThat(entry(actor.id(),"AD_EMAIL","v1").getAgreedAt()).isEqualTo(changed);
    }
    @Test void queryDoesNotTreatOldOrLegacyRecordsAsCurrentConsent()throws Exception{
        var actor=actor();var old=Instant.EPOCH;
        terms.saveAndFlush(new TermsAgreement(actor.id(),"AD_EMAIL","v0",true,old));
        terms.saveAndFlush(new TermsAgreement(actor.id(),"AD_PUSH","v0",false,old));
        terms.saveAndFlush(new TermsAgreement(actor.id(),"MARKETING","v1",true,old));
        terms.saveAndFlush(new TermsAgreement(actor.id(),"SERVICE","v2",true,old));
        mvc.perform(get("/api/v1/me/terms").header("Authorization","Bearer "+actor.token()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("agreements[0].recordStatus").value("NOT_RECORDED"))
            .andExpect(jsonPath("agreements[1].recordStatus").value("PREVIOUS_VERSION_ONLY"))
            .andExpect(jsonPath("agreements[1].termsVersion").value("v1"))
            .andExpect(jsonPath("agreements[1].agreed").value(false))
            .andExpect(jsonPath("agreements[1].agreedAt").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("agreements[2].recordStatus").value("PREVIOUS_VERSION_ONLY"));
        assertThat(entry(actor.id(),"AD_EMAIL","v0").isAgreed()).isTrue();
        assertThat(terms.findAll().stream().filter(t->t.getUserId().equals(actor.id()))).hasSize(4);
    }
    @Test void configuredVersionWinsOverTimestampsAndVersionLabelOrdering(){
        var actor=actor();
        terms.saveAndFlush(new TermsAgreement(actor.id(),"AD_EMAIL","v10",true,Instant.EPOCH));
        terms.saveAndFlush(new TermsAgreement(actor.id(),"AD_EMAIL","v9",true,Instant.now()));
        terms.saveAndFlush(new TermsAgreement(actor.id(),"AD_PUSH","v9",true,Instant.now()));
        var configured=new com.f106.DIO.user.service.UserTermsQueryService(users,terms,
            new com.f106.DIO.user.config.TermsProperties("v2","v2","v10"));
        var choices=configured.current(actor.id()).agreements();
        assertThat(choices.get(1).termsVersion()).isEqualTo("v10");
        assertThat(choices.get(1).agreedAt()).isEqualTo(Instant.EPOCH);
        assertThat(choices.get(1).recordStatus()).isEqualTo(TermsRecordStatus.CURRENT_VERSION);
        assertThat(choices.get(2).agreed()).isFalse();
        assertThat(choices.get(2).agreedAt()).isNull();
        assertThat(choices.get(2).recordStatus()).isEqualTo(TermsRecordStatus.PREVIOUS_VERSION_ONLY);
    }
    @Test void putChangesAreImmediatelyVisibleInGetAndRepeatedGetDoesNotChangeTimestamp()throws Exception{
        var actor=actor();
        updates.update(actor.id(),TermsType.AD_EMAIL,"v1",true);
        mvc.perform(get("/api/v1/me/terms").header("Authorization","Bearer "+actor.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("agreements[1].agreed").value(true));
        mvc.perform(put("/api/v1/me/terms/AD_EMAIL/v1").header("Authorization","Bearer "+actor.token())
            .contentType("application/json").content("{\"agreed\":false}")).andExpect(status().isOk());
        var changed=entry(actor.id(),"AD_EMAIL","v1").getAgreedAt();
        for(int i=0;i<2;i++)mvc.perform(get("/api/v1/me/terms").header("Authorization","Bearer "+actor.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("agreements[1].agreed").value(false))
            .andExpect(jsonPath("agreements[1].recordStatus").value("CURRENT_VERSION"));
        assertThat(entry(actor.id(),"AD_EMAIL","v1").getAgreedAt()).isEqualTo(changed);
    }
    @Test void anonymousRevokedAndInactiveAccountsCannotReadTerms()throws Exception{
        for(String token:new String[]{"","Bearer invalid"})mvc.perform(get("/api/v1/me/terms").header("Authorization",token))
            .andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control","no-store"));
        var actor=actor();
        mvc.perform(post("/api/v1/auth/logout").header("Authorization","Bearer "+actor.token())).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/terms").header("Authorization","Bearer "+actor.token()))
            .andExpect(status().isUnauthorized());
        var inactive=actor();var user=users.findById(inactive.id()).orElseThrow();
        user.withdraw(Instant.now());users.saveAndFlush(user);
        mvc.perform(get("/api/v1/me/terms").header("Authorization","Bearer "+inactive.token()))
            .andExpect(status().isUnauthorized());
        assertThatThrownBy(()->queries.current(inactive.id())).isInstanceOf(com.f106.DIO.user.exception.UserException.class);
        assertThatThrownBy(()->queries.current(Long.MAX_VALUE)).isInstanceOf(com.f106.DIO.user.exception.UserException.class);
    }
    @Test void optionalChoicesAreIndependentAndLegacyIsNotExpanded() throws Exception {
        var actor=actor();
        for(var type:new TermsType[]{TermsType.MARKETING_PRIVACY,TermsType.AD_EMAIL,TermsType.AD_PUSH,TermsType.AD_NIGHT_PUSH}) {
            mvc.perform(put("/api/v1/me/terms/"+type+"/v1").header("Authorization","Bearer "+actor.token())
                .contentType("application/json").content("{\"agreed\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("termsType").value(type.name()));
        }
        updates.update(actor.id(),TermsType.AD_EMAIL,"v1",false);
        assertThat(entry(actor.id(),"AD_EMAIL","v1").isAgreed()).isFalse();
        assertThat(entry(actor.id(),"AD_PUSH","v1").isAgreed()).isTrue();
        var legacy=actor();updates.update(legacy.id(),TermsType.MARKETING,"v1",true);
        assertThat(terms.findAll().stream().filter(t->t.getUserId().equals(legacy.id())).count()).isEqualTo(1);
    }
    @Test void signupValidatesOptionalChoicesIndependently() {
        var service=new com.f106.DIO.user.service.UserTermsService(terms,new com.f106.DIO.user.config.TermsProperties("v2","v2","v1"));
        var list=new java.util.ArrayList<com.f106.DIO.user.dto.Agreement>();
        list.add(new com.f106.DIO.user.dto.Agreement(TermsType.SERVICE,"v2",true));
        list.add(new com.f106.DIO.user.dto.Agreement(TermsType.PRIVACY,"v2",true));
        for(var type:new TermsType[]{TermsType.MARKETING_PRIVACY,TermsType.AD_EMAIL,TermsType.AD_PUSH,TermsType.AD_NIGHT_PUSH})
            list.add(new com.f106.DIO.user.dto.Agreement(type,"v1",false));
        service.validate(list);
        list.add(new com.f106.DIO.user.dto.Agreement(TermsType.AD_EMAIL,"v1",true));
        assertThatThrownBy(()->service.validate(list)).isInstanceOf(com.f106.DIO.user.exception.UserException.class);
        list.remove(list.size()-1);list.set(2,new com.f106.DIO.user.dto.Agreement(TermsType.MARKETING_PRIVACY,"invalid",true));
        assertThatThrownBy(()->service.validate(list)).isInstanceOf(com.f106.DIO.user.exception.UserException.class);
    }
    @Test void anonymousAndInvalidTokensCannotWrite()throws Exception{
        for(String token:new String[]{"","Bearer invalid"})mvc.perform(put("/api/v1/me/terms/MARKETING/v1")
            .header("Authorization",token).contentType("application/json").content("{\"agreed\":true}"))
            .andExpect(status().isUnauthorized());
    }
    @Test void marketingCanBeWithdrawnAndRepeatedPutPreservesTimestampAndOtherUsers()throws Exception{
        var actor=actor();var other=actor();var original=Instant.parse("2026-01-01T00:00:00Z");
        terms.saveAndFlush(new TermsAgreement(actor.id(),"MARKETING","v1",true,original));
        terms.saveAndFlush(new TermsAgreement(other.id(),"MARKETING","v1",true,original));
        mvc.perform(put("/api/v1/me/terms/MARKETING/v1").header("Authorization","Bearer "+actor.token())
            .contentType("application/json").content("{\"agreed\":false}"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("agreed").value(false)).andExpect(jsonPath("termsType").value("MARKETING"));
        var changed=entry(actor.id(),"MARKETING","v1").getAgreedAt();assertThat(changed).isAfter(original);
        mvc.perform(put("/api/v1/me/terms/MARKETING/v1").header("Authorization","Bearer "+actor.token())
            .contentType("application/json").content("{\"agreed\":false}" )).andExpect(status().isOk());
        assertThat(entry(actor.id(),"MARKETING","v1").getAgreedAt()).isEqualTo(changed);
        assertThat(entry(other.id(),"MARKETING","v1").isAgreed()).isTrue();
        updates.update(actor.id(),TermsType.MARKETING,"v1",true);
        assertThat(entry(actor.id(),"MARKETING","v1").isAgreed()).isTrue();
    }
    @Test void currentVersionAgreementPreservesPreviousVersion()throws Exception{
        var actor=actor();terms.saveAndFlush(new TermsAgreement(actor.id(),"SERVICE","v1",true,Instant.EPOCH));
        mvc.perform(put("/api/v1/me/terms/SERVICE/v2").header("Authorization","Bearer "+actor.token())
            .contentType("application/json").content("{\"agreed\":true}" )).andExpect(status().isOk());
        assertThat(entry(actor.id(),"SERVICE","v1").getAgreedAt()).isEqualTo(Instant.EPOCH);
        assertThat(entry(actor.id(),"SERVICE","v2").isAgreed()).isTrue();
    }
    @Test void invalidInputAndRequiredWithdrawalAreRejectedWithoutWrites()throws Exception{
        var actor=actor();
        for(String path:new String[]{"SERVICE/v1","UNKNOWN/v1","MARKETING/unknown"})mvc.perform(put("/api/v1/me/terms/"+path)
            .header("Authorization","Bearer "+actor.token()).contentType("application/json").content("{\"agreed\":true}"))
            .andExpect(status().isBadRequest());
        for(String type:new String[]{"SERVICE/v2","PRIVACY/v2"})mvc.perform(put("/api/v1/me/terms/"+type)
            .header("Authorization","Bearer "+actor.token()).contentType("application/json").content("{\"agreed\":false}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("REQUIRED_TERMS_NOT_AGREED"));
        for(String body:new String[]{"{}","{\"agreed\":null}","{broken"})mvc.perform(put("/api/v1/me/terms/MARKETING/v1")
            .header("Authorization","Bearer "+actor.token()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        assertThat(terms.findAll().stream().filter(t->t.getUserId().equals(actor.id()))).isEmpty();
    }
    @Test void revokedSessionAndInactiveAccountCannotChangeAgreement()throws Exception{
        var actor=actor();
        mvc.perform(post("/api/v1/auth/logout").header("Authorization","Bearer "+actor.token())).andExpect(status().isNoContent());
        mvc.perform(put("/api/v1/me/terms/MARKETING/v1").header("Authorization","Bearer "+actor.token())
            .contentType("application/json").content("{\"agreed\":true}" )).andExpect(status().isUnauthorized());
        var user=users.findById(actor.id()).orElseThrow();user.withdraw(Instant.now());users.saveAndFlush(user);
        assertThatThrownBy(()->updates.update(actor.id(),TermsType.MARKETING,"v1",true))
            .isInstanceOf(com.f106.DIO.user.exception.UserException.class);
    }
    @Test void simultaneousFirstAgreementCreatesOnlyOneRow()throws Exception{
        var actor=actor();var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try{
            var first=pool.submit(()->{start.await();return updates.update(actor.id(),TermsType.MARKETING,"v1",true);});
            var second=pool.submit(()->{start.await();return updates.update(actor.id(),TermsType.MARKETING,"v1",true);});
            start.countDown();assertThat(first.get(15,TimeUnit.SECONDS).agreedAt()).isEqualTo(second.get(15,TimeUnit.SECONDS).agreedAt());
            assertThat(terms.findAll().stream().filter(t->t.getUserId().equals(actor.id()))).hasSize(1);
        }finally{pool.shutdownNow();}
    }
}
