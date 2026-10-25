package com.f106.DIO.auth.login;

import org.springframework.http.HttpStatus;

class LoginException extends RuntimeException {
    final HttpStatus status;
    final String code;
    LoginException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    static LoginException credentials() {
        return new LoginException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "이메일 또는 비밀번호를 확인해 주세요.");
    }
    static LoginException token() {
        return new LoginException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "로그인이 만료됐어요. 다시 로그인해 주세요.");
    }
}
