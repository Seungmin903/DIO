package com.f106.DIO.auth.service;

import com.f106.DIO.auth.domain.SocialProvider;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.infrastructure.social.AppleAccountRevoker;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * 애플로 가입한 회원이 탈퇴하면 DB 탈퇴 전에 Apple 토큰을 철회한다.
 * 외부 호출이라 DB 트랜잭션 밖에서 먼저 실행하고, 실패하면 탈퇴하지 않는다.
 * 철회 후 DB 탈퇴가 실패해도(예: 다이어리 소유권 양도 필요) 회원은 애플로 다시 로그인할 수 있다.
 */
@Service
public class AppleWithdrawalRevocation {
    private final EmailAuthProviderRepository accounts;
    private final AppleAccountRevoker revoker;

    public AppleWithdrawalRevocation(EmailAuthProviderRepository accounts, AppleAccountRevoker revoker) {
        this.accounts = accounts;
        this.revoker = revoker;
    }

    public void revokeIfLinked(long userId, String appleAuthorizationCode) {
        var apple = accounts.findByUserIdAndProvider(userId, SocialProvider.APPLE.name());
        if (apple.isEmpty()) return;
        if (appleAuthorizationCode == null || appleAuthorizationCode.isBlank())
            throw new LoginException(HttpStatus.BAD_REQUEST, "APPLE_REAUTH_REQUIRED",
                "탈퇴하려면 애플 계정으로 한 번 더 확인해 주세요.");
        revoker.revoke(apple.get().getProviderUserId(), appleAuthorizationCode);
    }
}
