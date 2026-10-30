package com.f106.DIO.auth.service;

import com.f106.DIO.auth.dto.PasswordChangeRequest;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.repository.*;
import com.f106.DIO.auth.support.LoginThrottle;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class PasswordChangeService {
    private final EmailAuthProviderRepository accounts;
    private final UserRepository users;
    private final RefreshTokenRepository tokens;
    private final PasswordResetRepository resets;
    private final LoginSessionRevoker sessions;
    private final LoginThrottle throttle;
    private final PasswordEncoder passwords;
    private final TransactionTemplate read,write;
    public PasswordChangeService(EmailAuthProviderRepository accounts,UserRepository users,RefreshTokenRepository tokens,
        PasswordResetRepository resets,LoginSessionRevoker sessions,LoginThrottle throttle,
        @Qualifier("authPasswordEncoder") PasswordEncoder passwords,PlatformTransactionManager manager){
        this.accounts=accounts;this.users=users;this.tokens=tokens;this.resets=resets;this.sessions=sessions;this.throttle=throttle;this.passwords=passwords;
        read=new TransactionTemplate(manager);read.setReadOnly(true);write=new TransactionTemplate(manager);
    }
    private LoginException invalid(String code,String detail){return new LoginException(HttpStatus.BAD_REQUEST,code,detail);}
    @Transactional(propagation=Propagation.NEVER)
    public void change(Jwt jwt,PasswordChangeRequest request,String ip){
        long actor;UUID sid;
        try{actor=Long.parseLong(jwt.getSubject());sid=UUID.fromString(jwt.getClaimAsString("sid"));}
        catch(RuntimeException error){throw LoginException.token();}
        var reservation=throttle.reserve("password-change:"+actor,ip);
        try{
            var account=read.execute(status->accounts.findByUserIdAndProvider(actor,"EMAIL").orElseThrow(()->invalid("EMAIL_PASSWORD_REQUIRED","이메일 로그인 계정만 비밀번호를 변경할 수 있어요.")));
            String hash=account.getPasswordHash();
            if(hash==null)throw invalid("EMAIL_PASSWORD_REQUIRED","이메일 로그인 계정만 비밀번호를 변경할 수 있어요.");
            // BCrypt는 DB 트랜잭션과 행 잠금 밖에서 수행한다.
            if(!passwords.matches(request.currentPassword(),hash)){
                throttle.failed(reservation);throw invalid("CURRENT_PASSWORD_MISMATCH","현재 비밀번호가 맞지 않아요.");
            }
            if(request.currentPassword().equals(request.newPassword()))throw invalid("PASSWORD_UNCHANGED","현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
            String encoded=passwords.encode(request.newPassword());
            write.executeWithoutResult(status->{
                var current=accounts.findForUpdate("EMAIL",account.getProviderUserId()).orElseThrow(LoginException::token);
                if(!current.getUserId().equals(actor)||!hash.equals(current.getPasswordHash()))throw invalid("PASSWORD_CHANGED","비밀번호가 변경됐어요. 다시 로그인해 주세요.");
                if(!users.findById(actor).map(User::isActive).orElse(false))throw LoginException.token();
                Instant now=Instant.now();
                var reset=resets.findForUpdate(account.getProviderUserId()).orElse(null);
                tokens.findBySessionId(sid).filter(t->t.getUserId().equals(actor)&&t.active(now)).orElseThrow(LoginException::token);
                current.resetPassword(encoded);
                if(reset!=null)reset.consume(now);
                sessions.revokeAll(actor,now);
            });
            throttle.success(reservation);
        }finally{throttle.cancel(reservation);}
    }
}
