package com.f106.DIO.auth.service;

import com.f106.DIO.auth.domain.*;
import com.f106.DIO.auth.dto.*;
import com.f106.DIO.auth.exception.SocialLoginException;
import com.f106.DIO.auth.infrastructure.social.SocialIdentityVerifier;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.user.service.UserTermsService;
import com.f106.DIO.user.support.UserInput;
import jakarta.validation.Validator;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.crypto.password.PasswordEncoder;

/** No public endpoint until real provider verification is configured. */
@Service
public class SocialLoginService {
    private final Map<SocialProvider,SocialIdentityVerifier> verifiers=new EnumMap<>(SocialProvider.class);
    private final EmailAuthProviderRepository accounts;
    private final UserRepository users;
    private final UserTermsService terms;
    private final LoginSessionService sessions;
    private final LoginJwt jwt;
    private final com.f106.DIO.user.service.UserPhotoService photos;
    private final Validator validator;
    private final TransactionTemplate transaction;
    private final PasswordEncoder passwords;
    public SocialLoginService(List<SocialIdentityVerifier> adapters,EmailAuthProviderRepository accounts,UserRepository users,
            UserTermsService terms,LoginSessionService sessions,LoginJwt jwt,Validator validator,PlatformTransactionManager manager,com.f106.DIO.user.service.UserPhotoService photos,@Qualifier("authPasswordEncoder") PasswordEncoder passwords){
        for(var adapter:adapters)if(verifiers.put(adapter.provider(),adapter)!=null)throw new IllegalStateException("Duplicate social verifier");
        this.photos=photos;
        this.accounts=accounts;this.users=users;this.terms=terms;this.sessions=sessions;this.jwt=jwt;this.validator=validator;
        transaction=new TransactionTemplate(manager);this.passwords=passwords;
    }
    @Transactional(propagation=Propagation.NEVER)
    public LoginResponse link(SocialProvider provider,String credential,String email,String password,String deviceName){
        var verifier=provider==null?null:verifiers.get(provider);
        if(verifier==null)throw error(HttpStatus.SERVICE_UNAVAILABLE,"SOCIAL_PROVIDER_NOT_CONFIGURED","아직 준비 중인 로그인 방식이에요.");
        if(credential==null||credential.isBlank()||credential.length()>16384||password==null||password.isBlank())throw error(HttpStatus.BAD_REQUEST,"INVALID_SOCIAL_REQUEST","로그인 요청을 확인해 주세요.");
        jwt.configured();var identity=verifier.verify(credential);String normalized=UserInput.normalizeEmail(email);
        if(identity==null||identity.provider()!=provider||!identity.emailVerified()||!normalized.equals(UserInput.normalizeEmail(identity.email())))throw error(HttpStatus.UNAUTHORIZED,"INVALID_SOCIAL_CREDENTIAL","소셜 인증을 다시 진행해 주세요.");
        try { return transaction.execute(status->{
            if(accounts.findForUpdate(provider.name(),identity.subject()).isPresent())throw error(HttpStatus.CONFLICT,"SOCIAL_IDENTITY_ALREADY_LINKED","이미 다른 계정에 연결된 소셜 계정이에요.");
            var emailAccount=accounts.findForUpdate("EMAIL",normalized).orElseThrow(()->error(HttpStatus.UNAUTHORIZED,"INVALID_EXISTING_CREDENTIALS","기존 이메일 또는 비밀번호를 확인해 주세요."));
            if(emailAccount.getPasswordHash()==null||!passwords.matches(password,emailAccount.getPasswordHash()))throw error(HttpStatus.UNAUTHORIZED,"INVALID_EXISTING_CREDENTIALS","기존 이메일 또는 비밀번호를 확인해 주세요.");
            var user=users.findForUpdate(emailAccount.getUserId()).filter(u->u.isActive()).orElseThrow(()->error(HttpStatus.UNAUTHORIZED,"SOCIAL_ACCOUNT_INACTIVE","사용할 수 없는 계정이에요."));
            if(accounts.findByUserIdAndProvider(user.getUserId(),provider.name()).isPresent())throw error(HttpStatus.CONFLICT,"SOCIAL_PROVIDER_ALREADY_LINKED","이미 연결된 로그인 방식이에요.");
            accounts.saveAndFlush(EmailAuthProvider.social(user.getUserId(),provider,identity.subject(),Instant.now()));
            return sessions.create(user,deviceName,Instant.now());
        }); } catch(org.springframework.dao.DataIntegrityViolationException conflict) {
            throw error(HttpStatus.CONFLICT,"SOCIAL_LINK_CONFLICT","계정 연결 상태가 변경됐어요. 다시 확인해 주세요.");
        }
    }
    @Transactional(propagation=Propagation.NEVER)
    public void unlink(long userId,SocialProvider provider,String credential){
        var verifier=provider==null?null:verifiers.get(provider);
        if(verifier==null)throw error(HttpStatus.BAD_REQUEST,"INVALID_SOCIAL_PROVIDER","로그인 방식을 확인해 주세요.");
        if(credential==null||credential.isBlank()||credential.length()>16384)throw error(HttpStatus.BAD_REQUEST,"INVALID_SOCIAL_REQUEST","연결 해제 요청을 확인해 주세요.");
        var identity=verifier.verify(credential);
        if(identity==null||identity.provider()!=provider)throw error(HttpStatus.UNAUTHORIZED,"INVALID_SOCIAL_CREDENTIAL","소셜 인증을 다시 진행해 주세요.");
        transaction.executeWithoutResult(status->{
            var linked=accounts.findForUpdate(provider.name(),identity.subject()).orElseThrow(()->error(HttpStatus.NOT_FOUND,"SOCIAL_PROVIDER_NOT_LINKED","연결된 로그인 방식이 아니에요."));
            if(!linked.getUserId().equals(userId))throw error(HttpStatus.FORBIDDEN,"SOCIAL_PROVIDER_MISMATCH","다른 계정에 연결된 로그인 방식이에요.");
            var all=accounts.findAllForUserUpdate(userId);
            if(all.size()<=1)throw error(HttpStatus.CONFLICT,"LAST_LOGIN_PROVIDER","마지막 로그인 방식은 해제할 수 없어요.");
            accounts.delete(linked);
        });
    }
    @Transactional(propagation=Propagation.NEVER)
    public LoginResponse authenticate(SocialProvider provider,String credential,SocialEnrollment enrollment,String deviceName){
        return authenticate(provider,credential,enrollment,deviceName,null);
    }
    @Transactional(propagation=Propagation.NEVER)
    public LoginResponse authenticate(SocialProvider provider,String credential,SocialEnrollment enrollment,String deviceName,org.springframework.web.multipart.MultipartFile photo){
        var verifier=provider==null?null:verifiers.get(provider);
        if(verifier==null)throw error(HttpStatus.SERVICE_UNAVAILABLE,"SOCIAL_PROVIDER_NOT_CONFIGURED","아직 준비 중인 로그인 방식이에요.");
        if(credential==null||credential.isBlank()||credential.length()>16384||deviceName!=null&&deviceName.length()>100)
            throw error(HttpStatus.BAD_REQUEST,"INVALID_SOCIAL_REQUEST","로그인 요청을 확인해 주세요.");
        jwt.configured();
        // Provider network/signature checks must finish before any database transaction begins.
        var identity=verifier.verify(credential);
        if(identity==null||identity.provider()!=provider||identity.subject()==null||identity.subject().isBlank()||identity.subject().length()>255)
            throw error(HttpStatus.UNAUTHORIZED,"INVALID_SOCIAL_CREDENTIAL","소셜 인증을 다시 진행해 주세요.");
        byte[] image=enrollment==null?null:photos.prepareImage(photo);
        try(var pending=photos.upload(image)) { return transaction.execute(status->{
            var account=accounts.findForUpdate(provider.name(),identity.subject()).orElse(null);
            var now=Instant.now();
            if(account!=null){
                var user=users.findForUpdate(account.getUserId()).filter(u->u.isActive()).orElseThrow(()->
                    error(HttpStatus.UNAUTHORIZED,"SOCIAL_ACCOUNT_INACTIVE","사용할 수 없는 계정이에요."));
                return sessions.create(user,deviceName,now);
            }
            // 기존 이메일 계정은 약관·프로필을 다시 입력시키지 않고 곧바로
            // 비밀번호 확인을 거쳐 제공자를 연결한다. 이메일 일치만으로는 연결하지 않는다.
            String email=UserInput.normalizeEmail(identity.email());
            if(enrollment==null && identity.emailVerified() && email!=null && users.existsByEmail(email))
                throw error(HttpStatus.CONFLICT,"SOCIAL_ACCOUNT_LINK_REQUIRED","기존 계정 비밀번호를 확인해 구글 로그인을 연결해 주세요.");
            if(enrollment==null)throw error(HttpStatus.CONFLICT,"SOCIAL_SIGNUP_REQUIRED","가입 정보를 입력해 주세요.");
            if(!validator.validate(enrollment).isEmpty())throw error(HttpStatus.BAD_REQUEST,"INVALID_SOCIAL_ENROLLMENT","연령 확인과 가입 정보를 확인해 주세요.");
            terms.validate(enrollment.agreements());
            if(!identity.emailVerified()||email==null||email.length()>254||!email.matches(UserInput.EMAIL_PATTERN))
                throw error(HttpStatus.CONFLICT,"SOCIAL_VERIFIED_EMAIL_REQUIRED","확인된 이메일이 필요해요.");
            // Never merge accounts just because their email addresses match.
            if(users.existsByEmail(email))throw error(HttpStatus.CONFLICT,"SOCIAL_ACCOUNT_LINK_REQUIRED","기존 계정으로 로그인해 주세요.");
            var user=users.saveAndFlush(new com.f106.DIO.user.domain.User(email,enrollment.nickname(),now));
            accounts.saveAndFlush(EmailAuthProvider.social(user.getUserId(),provider,identity.subject(),now));
            terms.save(user.getUserId(),enrollment.agreements(),now);
            if(pending!=null){pending.enlist();pending.save(user.getUserId(),now);}
            return sessions.create(user,deviceName,now);
        }); } catch(org.springframework.dao.DataIntegrityViolationException conflict) {
            for(Throwable cause=conflict;cause!=null;cause=cause.getCause()) {
                if(cause instanceof org.hibernate.exception.ConstraintViolationException violation
                    && "23505".equals(violation.getSQLState()) && java.util.Set.of("users_email_unique",
                    "user_auth_accounts_provider_subject_unique","user_auth_accounts_user_provider_unique")
                    .contains(violation.getConstraintName()==null?"":violation.getConstraintName()))
                    throw error(HttpStatus.CONFLICT,"SOCIAL_SIGNUP_CONFLICT","가입 상태가 변경됐어요. 다시 로그인해 주세요.");
            }
            throw conflict;
        }
    }
    private static SocialLoginException error(HttpStatus status,String code,String message){return new SocialLoginException(status,code,message);}
}
