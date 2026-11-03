package com.f106.DIO.auth.domain;

/** 인증번호 입력 기한과 인증 완료 후 가입 기한을 구분한다. */
public final class SignupVerificationPolicy {
    public static final int CODE_TTL_SECONDS = 600;
    public static final int SIGNUP_TOKEN_TTL_SECONDS = 3600;
    private SignupVerificationPolicy() {}
}
