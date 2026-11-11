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
 "dio.signup.photos.storage=local","dio.signup.photos.local-directory=build/test-social-photos/${org.gradle.test.worker:0}",
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
  code(()->social.authenticate(SocialProvider.KAKAO,UUID.randomUUID()+";"+user.getEmail()+";true",null,null),"SOCIAL_EXISTING_PROVIDER_LOGIN_REQUIRED");
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
 org.springframework.test.web.servlet.ResultActions postLink(String provider,String ip,String idToken,String email,String password) throws Exception {
  var body=json.writeValueAsString(java.util.Map.of("idToken",idToken,"email",email,"password",password));
  return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/auth/oauth/"+provider+"/link")
   .with(request->{request.setRemoteAddr(ip);return request;}).contentType("application/json").content(body));
 }
 @Test void linkEndpointReturnsNoStoreAndRejectsUnknownProvider() throws Exception {
  var user=users.saveAndFlush(new User("link-http@example.com","연결HTTP",Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),passwords.encode("Password123!"),Instant.now()));
  postLink("kakao","10.20.0.1","link-http-subject;"+user.getEmail()+";true",user.getEmail(),"Password123!")
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Cache-Control","no-store"))
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("user.userId").value(user.getUserId().toString()));
  postLink("unknown","10.20.0.1","token",user.getEmail(),"Password123!")
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("code").value("INVALID_SOCIAL_PROVIDER"));
 }
 @Test void linkEndpointLimitsRepeatedWrongPasswordsButNotOtherConflicts() throws Exception {
  var user=users.saveAndFlush(new User("link-throttle@example.com","연결제한",Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),passwords.encode("Password123!"),Instant.now()));
  String credential="link-throttle-subject;"+user.getEmail()+";true";
  for(int i=0;i<5;i++)postLink("kakao","10.20.0.2",credential,user.getEmail(),"Wrong123!")
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("code").value("INVALID_EXISTING_CREDENTIALS"));
  postLink("kakao","10.20.0.2",credential,user.getEmail(),"Password123!")
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isTooManyRequests())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Retry-After","900"));
  assertThat(accounts.findByUserIdAndProvider(user.getUserId(),"KAKAO")).isEmpty();
  // 연결 실패는 같은 계정·주소의 이메일 로그인 예산을 함께 쓰고, 같은 주소의 다른 계정은 막지 않는다
  assertThatThrownBy(()->login.login(new com.f106.DIO.auth.dto.LoginRequest(user.getEmail(),"Password123!","phone"),"10.20.0.2"))
   .isInstanceOfSatisfying(com.f106.DIO.auth.exception.LoginException.class,e->assertThat(e.code).isEqualTo("LOGIN_RATE_LIMITED"));
  var other=users.saveAndFlush(new User("link-throttle-other@example.com","다른회원",Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(other.getUserId(),other.getEmail(),passwords.encode("Password123!"),Instant.now()));
  postLink("kakao","10.20.0.2","other-subject;"+other.getEmail()+";true",other.getEmail(),"Password123!")
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());

  // 다른 주소에서는 연결되고, 이미 연결된 뒤의 충돌은 비밀번호 실패로 세지 않아 예약도 남지 않는다
  postLink("kakao","10.20.0.3",credential,user.getEmail(),"Password123!")
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
  for(int i=0;i<6;i++)postLink("kakao","10.20.0.3","another-subject;"+user.getEmail()+";true",user.getEmail(),"Password123!")
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isConflict())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("code").value("SOCIAL_PROVIDER_ALREADY_LINKED"));
 }
 @Test void linkingRejectsAnIdentityOrProviderAlreadyLinkedToAnAccount(){
  var first=users.saveAndFlush(new User("first-linked@example.com","첫회원",Instant.now()));
  var second=users.saveAndFlush(new User("second-linked@example.com","둘회원",Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(first.getUserId(),first.getEmail(),passwords.encode("Password123!"),Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(second.getUserId(),second.getEmail(),passwords.encode("Password123!"),Instant.now()));
  accounts.saveAndFlush(EmailAuthProvider.social(second.getUserId(),SocialProvider.KAKAO,"already-linked",Instant.now()));
  code(()->social.link(SocialProvider.KAKAO,"already-linked;"+first.getEmail()+";true",first.getEmail(),"Password123!",null),"SOCIAL_IDENTITY_ALREADY_LINKED");
  code(()->social.link(SocialProvider.KAKAO,"new-subject;"+second.getEmail()+";true",second.getEmail(),"Password123!",null),"SOCIAL_PROVIDER_ALREADY_LINKED");
 }
 @Test void unlinkRequiresTheOwnerAndAnotherUsableLoginMethod(){
  var user=users.saveAndFlush(new User("unlink@example.com","해제회원",Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),passwords.encode("Password123!"),Instant.now()));
  accounts.saveAndFlush(EmailAuthProvider.social(user.getUserId(),SocialProvider.KAKAO,"unlink-subject",Instant.now()));
  social.unlink(user.getUserId(),SocialProvider.KAKAO,"unlink-subject;"+user.getEmail()+";true");
  assertThat(accounts.findByUserIdAndProvider(user.getUserId(),"KAKAO")).isEmpty();

  var socialOnly=users.saveAndFlush(new User("social-only@example.com","소셜회원",Instant.now()));
  accounts.saveAndFlush(EmailAuthProvider.social(socialOnly.getUserId(),SocialProvider.KAKAO,"only-subject",Instant.now()));
  code(()->social.unlink(socialOnly.getUserId(),SocialProvider.KAKAO,"only-subject;"+socialOnly.getEmail()+";true"),"LAST_LOGIN_PROVIDER");
  code(()->social.unlink(user.getUserId(),SocialProvider.KAKAO,"only-subject;"+socialOnly.getEmail()+";true"),"SOCIAL_PROVIDER_MISMATCH");
  code(()->social.unlink(user.getUserId(),SocialProvider.KAKAO,"missing-subject;"+user.getEmail()+";true"),"SOCIAL_PROVIDER_NOT_LINKED");
 }
 @Test void unlinkDoesNotTreatPasswordlessEmailRecordAsUsable(){
  var user=users.saveAndFlush(new User("passwordless@example.com","비밀번호없음",Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),null,Instant.now()));
  accounts.saveAndFlush(EmailAuthProvider.social(user.getUserId(),SocialProvider.KAKAO,"passwordless-subject",Instant.now()));
  code(()->social.unlink(user.getUserId(),SocialProvider.KAKAO,"passwordless-subject;"+user.getEmail()+";true"),"LAST_LOGIN_PROVIDER");
 }
 @Test void unlinkEndpointReturnsNoStoreAndRejectsUnknownProvider() throws Exception {
  var user=users.saveAndFlush(new User("unlink-http@example.com","해제HTTP",Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),passwords.encode("Password123!"),Instant.now()));
  accounts.saveAndFlush(EmailAuthProvider.social(user.getUserId(),SocialProvider.KAKAO,"unlink-http-subject",Instant.now()));
  var token=login.login(new com.f106.DIO.auth.dto.LoginRequest(user.getEmail(),"Password123!","phone"),"127.0.0.1").accessToken();
  mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/me/auth-providers/kakao")
   .header("Authorization","Bearer "+token)
   .contentType("application/json").content("{\"idToken\":\"unlink-http-subject;"+user.getEmail()+";true\"}"))
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNoContent())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Cache-Control","no-store"));
  mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/me/auth-providers/unknown")
   .header("Authorization","Bearer "+token)
   .contentType("application/json").content("{\"idToken\":\"token\"}"))
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest())
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("code").value("INVALID_SOCIAL_PROVIDER"));
  mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/me/auth-providers/kakao")
   .contentType("application/json").content("{\"idToken\":\"token\"}"))
   .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
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
