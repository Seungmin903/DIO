package com.f106.DIO.auth.exception;

import org.springframework.http.HttpStatus;

public class SignupException extends RuntimeException {
    public final HttpStatus status;
    public final String code;
    /** null이면 Retry-After를 보내지 않는다. 기다려도 풀리지 않는 429에 사용한다. */
    public final Long retryAfterSeconds;
    public SignupException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }
    public SignupException(HttpStatus status, String code, String message, Long retryAfterSeconds) {
        super(message); this.status = status; this.code = code; this.retryAfterSeconds = retryAfterSeconds;
    }
    public static SignupException conflict(String code, String message) {
        return new SignupException(HttpStatus.CONFLICT, code, message);
    }
    public static SignupException invalid(String code, String message) {
        return new SignupException(HttpStatus.BAD_REQUEST, code, message);
    }
}
