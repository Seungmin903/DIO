package com.f106.DIO.auth.domain;

/** 만료 계산·응답·메일·Swagger·요청 제한에서 함께 사용하는 재설정 정책. */
public final class PasswordResetPolicy {
    private PasswordResetPolicy() {}
    public static final int CODE_TTL_SECONDS = 600;
    public static final int TOKEN_TTL_SECONDS = 600;
    public static final int RESEND_COOLDOWN_SECONDS = 60;
    public static final int MAX_FAILED_ATTEMPTS = 5;
    public static final int IP_WINDOW_SECONDS = 900;
    public static final int MAX_SEND_REQUESTS = 20;
    public static final int MAX_VERIFY_OR_RESET_REQUESTS = 100;
}
