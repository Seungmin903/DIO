package com.f106.DIO.user.service;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.user.repository.UserWithdrawalDataRepository;
import com.f106.DIO.user.exception.UserException;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class UserWithdrawalService {
    private final UserRepository users;
    private final UserWithdrawalCredentials credentials;
    private final UserWithdrawalDiaries diaries;
    private final UserWithdrawalDataRepository data;
    public UserWithdrawalService(UserRepository users,UserWithdrawalCredentials credentials,UserWithdrawalDiaries diaries,UserWithdrawalDataRepository data){
        this.users=users;this.credentials=credentials;this.diaries=diaries;this.data=data;
    }
    @Transactional
    public void withdraw(long actor){
        credentials.lock(actor);
        var user=users.findForUpdate(actor).filter(u->u.isActive()).orElseThrow(()->new UserException(HttpStatus.UNAUTHORIZED,"INVALID_TOKEN","다시 로그인해 주세요."));
        String email=user.getEmail();Instant now=Instant.now();
        diaries.remove(actor,now);
        credentials.erase(actor,email,now);
        data.erasePrivate(actor,now);
        // 다이어리 영구 삭제는 영속성 컨텍스트를 비우므로 다시 읽는다.
        users.findById(actor).orElseThrow().withdraw(now);
        users.flush();
    }
}
