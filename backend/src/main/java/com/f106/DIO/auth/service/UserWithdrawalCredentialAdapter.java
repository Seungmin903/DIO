package com.f106.DIO.auth.service;
import com.f106.DIO.auth.repository.*;
import com.f106.DIO.user.service.UserWithdrawalCredentials;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
@Component @Transactional(propagation=Propagation.MANDATORY)
public class UserWithdrawalCredentialAdapter implements UserWithdrawalCredentials {
    private final EmailAuthProviderRepository accounts;
    private final LoginSessionRevoker sessions;
    private final JdbcTemplate jdbc;
    public UserWithdrawalCredentialAdapter(EmailAuthProviderRepository accounts,LoginSessionRevoker sessions,JdbcTemplate jdbc){this.accounts=accounts;this.sessions=sessions;this.jdbc=jdbc;}
    public void lock(long id){accounts.findAllForUserUpdate(id);}
    public void erase(long id,String email,Instant now){
        if(email!=null){
            jdbc.update("delete from password_reset_verifications where email=?",email);
            jdbc.update("delete from signup_email_verifications where email=?",email);
        }
        sessions.revokeAll(id,now);
        jdbc.update("delete from refresh_token_history where token_id in (select token_id from refresh_tokens where user_id=?)",id);
        jdbc.update("delete from refresh_tokens where user_id=?",id);
        jdbc.update("delete from user_auth_accounts where user_id=?",id);
    }
}
