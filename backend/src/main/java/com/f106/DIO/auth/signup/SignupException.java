package com.f106.DIO.auth.signup;

import org.springframework.http.HttpStatus;

public class SignupException extends RuntimeException {
    final HttpStatus status;
    final String code;
    /** null이면 Retry-After를 보내지 않는다. 기다려도 풀리지 않는 429에 사용한다. */
    final Long retryAfterSeconds;
    SignupException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }
    SignupException(HttpStatus status, String code, String message, Long retryAfterSeconds) {
        super(message); this.status = status; this.code = code; this.retryAfterSeconds = retryAfterSeconds;
    }
    static SignupException conflict(String code, String message) {
        return new SignupException(HttpStatus.CONFLICT, code, message);
    }
    static SignupException invalid(String code, String message) {
        return new SignupException(HttpStatus.BAD_REQUEST, code, message);
    }
}
