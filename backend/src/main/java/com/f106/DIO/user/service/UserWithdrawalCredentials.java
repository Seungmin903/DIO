package com.f106.DIO.user.service;
import java.time.Instant;
/** 인증 저장소의 탈퇴 처리 포트. user 도메인은 auth 구현에 의존하지 않는다. */
public interface UserWithdrawalCredentials {
    void lock(long userId);
    void erase(long userId,String email,Instant now);
}
