package com.f106.DIO.auth.reset;

import org.springframework.http.HttpStatus;

class PasswordResetException extends RuntimeException {
    final HttpStatus status;
    final String code;
    int retryAfter = 900;
    PasswordResetException(HttpStatus status, String code, String message) {
        super(message); this.status = status; this.code = code;
    }
    static PasswordResetException invalid() {
        return new PasswordResetException(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD_RESET", "인증 정보가 유효하지 않아요. 새 인증번호를 요청해 주세요.");
    }
}
