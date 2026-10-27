package com.f106.DIO.auth.exception;

import org.springframework.http.HttpStatus;

public class LoginException extends RuntimeException {
    public final HttpStatus status;
    public final String code;
    public LoginException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    public static LoginException credentials() {
        return new LoginException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "이메일 또는 비밀번호를 확인해 주세요.");
    }
    public static LoginException token() {
        return new LoginException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "로그인이 만료됐어요. 다시 로그인해 주세요.");
    }
}
