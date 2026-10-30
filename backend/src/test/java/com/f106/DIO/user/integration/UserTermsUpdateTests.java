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

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:user-terms-update;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.service-terms-version=v2",
    "dio.signup.photos.storage=local","dio.signup.photos.local-directory=build/test-terms-photos",
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
        for(String type:new String[]{"SERVICE/v2","PRIVACY/v1"})mvc.perform(put("/api/v1/me/terms/"+type)
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
