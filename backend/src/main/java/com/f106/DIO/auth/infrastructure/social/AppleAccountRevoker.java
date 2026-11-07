package com.f106.DIO.auth.infrastructure.social;

/** 탈퇴하는 애플 회원의 Sign in with Apple 연결을 Apple 쪽에서 끊는다(App Store 심사 지침 5.1.1(v)). */
public interface AppleAccountRevoker {
    /**
     * 앱이 방금 받은 authorizationCode를 토큰으로 바꾸고, 그 토큰이 탈퇴 회원(subject)의 것인지 확인한 뒤 철회한다.
     * 실패하면 예외를 던지며, 호출한 쪽은 탈퇴를 진행하지 않는다.
     */
    void revoke(String subject, String authorizationCode);
}
