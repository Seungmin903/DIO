package com.f106.DIO.auth.integration;
import com.f106.DIO.auth.domain.*;
import com.f106.DIO.auth.dto.*;
import com.f106.DIO.auth.exception.SocialLoginException;
import com.f106.DIO.auth.infrastructure.social.SocialIdentityVerifier;
import com.f106.DIO.auth.repository.*;
import com.f106.DIO.auth.service.*;
import com.f106.DIO.user.domain.*;
import com.f106.DIO.user.dto.Agreement;
import com.f106.DIO.user.repository.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.assertj.core.api.Assertions.*;

@org.springframework.test.context.jdbc.Sql("/push-session-h2.sql")
@SpringBootTest(properties={
 "spring.datasource.url=jdbc:h2:mem:social-common;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
 "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","dio.auth.apple.client-ids=",
 "dio.signup.service-terms-version=v2","dio.signup.privacy-terms-version=v2",
 "dio.signup.photos.storage=local","dio.signup.photos.local-directory=build/test-social-photos",
 "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="})
@org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
@ActiveProfiles("test")
class SocialLoginTests {
 @TestConfiguration static class Config {
  @Bean SocialIdentityVerifier testOnlyVerifier(){return new SocialIdentityVerifier(){
   public SocialProvider provider(){return SocialProvider.KAKAO;}
   public VerifiedSocialIdentity verify(String credential){
    assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
    String[] parts=credential.split(";",-1);
    if(parts.length!=3)throw new SocialLoginException(org.springframework.http.HttpStatus.UNAUTHORIZED,"INVALID_SOCIAL_CREDENTIAL","invalid");
    return new VerifiedSocialIdentity(SocialProvider.KAKAO,parts[0],parts[1],Boolean.parseBoolean(parts[2]));
   }
  };}
 }
 @Autowired org.springframework.test.web.servlet.MockMvc mvc;
 @Autowired tools.jackson.databind.json.JsonMapper json;
 @Autowired SocialLoginService social;
 @Autowired EmailLoginService login;
 @Autowired EmailAuthProviderRepository accounts;
 @Autowired UserRepository users;
 @Autowired TermsAgreementRepository terms;
 @Autowired RefreshTokenRepository tokens;
 @Autowired @Qualifier("authPasswordEncoder") PasswordEncoder passwords;
 SocialEnrollment enrollment(){return new SocialEnrollment("소셜회원",true,List.of(
  new Agreement(TermsType.SERVICE,"v2",true),new Agreement(TermsType.PRIVACY,"v2",true),new Agreement(TermsType.AD_EMAIL,"v1",false)));}
 String credential(){String id=UUID.randomUUID().toString();return id+";"+id+"@example.com;true";}
 void code(Runnable call,String expected){assertThatThrownBy(()->call.run()).isInstanceOfSatisfying(SocialLoginException.class,e->assertThat(e.code).isEqualTo(expected));}
 @Test void createsAndReusesAccountAndRefreshSession(){
  String credential=credential();var first=social.authenticate(SocialProvider.KAKAO,credential,enrollment(),"phone");
  long id=Long.parseLong(first.user().userId());
  assertThat(accounts.findByUserIdAndProvider(id,"KAKAO").orElseThrow().getPasswordHash()).isNull();
  assertThat(terms.findAll().stream().filter(t->t.getUserId().equals(id)).count()).isEqualTo(3);
  var second=social.authenticate(SocialProvider.KAKAO,credential.split(";")[0]+";;false",null,null);
  assertThat(second.user().userId()).isEqualTo(first.user().userId());
  assertThat(login.refresh(first.refreshToken()).user().userId()).isEqualTo(first.user().userId());
 }
 @Test void unsupportedAndUnverifiedCredentialsCannotCreateUser(){
  long count=users.count();
  code(()->social.authenticate(SocialProvider.APPLE,"token",enrollment(),null),"SOCIAL_PROVIDER_NOT_CONFIGURED");
  code(()->social.authenticate(SocialProvider.KAKAO,"invalid",enrollment(),null),"INVALID_SOCIAL_CREDENTIAL");
  assertThat(users.count()).isEqualTo(count);
 }
 @Test void newIdentityRequiresEnrollmentAgeAndVerifiedEmail(){
  String c=credential();long count=users.count();
  code(()->social.authenticate(SocialProvider.KAKAO,c,null,null),"SOCIAL_SIGNUP_REQUIRED");
  code(()->social.authenticate(SocialProvider.KAKAO,c,new SocialEnrollment("소셜회원",false,enrollment().agreements()),null),"INVALID_SOCIAL_ENROLLMENT");
  code(()->social.authenticate(SocialProvider.KAKAO,c.replace(";true",";false"),enrollment(),null),"SOCIAL_VERIFIED_EMAIL_REQUIRED");
  assertThat(users.count()).isEqualTo(count);
 }
 @Test void emailCollisionNeverLinksExistingAccount(){
  var user=users.saveAndFlush(new User(UUID.randomUUID()+"@example.com","기존회원",Instant.now()));long count=tokens.count();
  code(()->social.authenticate(SocialProvider.KAKAO,UUID.randomUUID()+";"+user.getEmail()+";true",null,null),"SOCIAL_ACCOUNT_LINK_REQUIRED");
  code(()->social.authenticate(SocialProvider.KAKAO,UUID.randomUUID()+";"+user.getEmail()+";true",enrollment(),null),"SOCIAL_ACCOUNT_LINK_REQUIRED");
  assertThat(accounts.findByUserIdAndProvider(user.getUserId(),"KAKAO")).isEmpty();assertThat(tokens.count()).isEqualTo(count);
 }
 @Test void linksOnlyAfterMatchingExistingPassword(){
  var user=users.saveAndFlush(new User("linked@example.com","기존회원",Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),passwords.encode("Password123!"),Instant.now()));
  String credential="linked-subject;"+user.getEmail()+";true";
  code(()->social.link(SocialProvider.KAKAO,credential,user.getEmail(),"Wrong123!",null),"INVALID_EXISTING_CREDENTIALS");
  assertThat(accounts.findByUserIdAndProvider(user.getUserId(),"KAKAO")).isEmpty();
  var response=social.link(SocialProvider.KAKAO,credential,user.getEmail(),"Password123!",null);
  assertThat(response.user().userId()).isEqualTo(user.getUserId().toString());
  assertThat(accounts.findByUserIdAndProvider(user.getUserId(),"KAKAO")).isPresent();
 }
 @Test void inactiveSocialUserCannotLogin(){
  String c=credential();var r=social.authenticate(SocialProvider.KAKAO,c,enrollment(),null);
  var user=users.findById(Long.parseLong(r.user().userId())).orElseThrow();user.withdraw(Instant.now());users.saveAndFlush(user);
  code(()->social.authenticate(SocialProvider.KAKAO,c,null,null),"SOCIAL_ACCOUNT_INACTIVE");
 }

 @Test void httpEndpointRequiresValidTokenAndSupportsEnrollment() throws Exception {
  mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/auth/oauth/google")
   .contentType("application/json").content("{\"idToken\":\"\"}"))
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Cache-Control","no-store"));
  String credential=credential();
  mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/auth/oauth/kakao")
   .contentType("application/json").content(json.writeValueAsString(new SocialLoginRequest(credential,null,"phone"))))
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isConflict())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("code").value("SOCIAL_SIGNUP_REQUIRED"));
  mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/auth/oauth/kakao")
   .contentType("application/json").content(json.writeValueAsString(new SocialLoginRequest(credential,enrollment(),"phone"))))
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("accessToken").isNotEmpty())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Cache-Control","no-store"));
 }
 @Test void multipartUsesExistingPhotoStorage() throws Exception {
  String credential=credential();
  var image=new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB);
  var bytes=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(image,"png",bytes);
  var oauth=new org.springframework.mock.web.MockMultipartFile("oauth","oauth.json","application/json",json.writeValueAsBytes(new SocialLoginRequest(credential,enrollment(),"phone")));
  var photo=new org.springframework.mock.web.MockMultipartFile("photo","photo.png","image/png",bytes.toByteArray());
  mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/v1/auth/oauth/kakao").file(oauth).file(photo))
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("user.profilePhotoUrl").isNotEmpty());
 }
}
