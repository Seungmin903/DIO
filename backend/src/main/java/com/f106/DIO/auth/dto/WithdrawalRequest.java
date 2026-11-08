package com.f106.DIO.auth.dto;

import jakarta.validation.constraints.Size;

/** 회원 탈퇴 요청. 애플 회원만 앱에서 다시 받은 authorizationCode를 보낸다. 다른 회원은 본문 없이 보낸다. */
public record WithdrawalRequest(@Size(max = 4096) String appleAuthorizationCode) {
    @Override public String toString() { return "WithdrawalRequest[appleAuthorizationCode=REDACTED]"; }
}
