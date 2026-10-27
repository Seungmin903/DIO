package com.f106.DIO.auth.exception;

import org.springframework.http.HttpStatus;

public class SignupException extends RuntimeException {
    public final HttpStatus status;
    public final String code;
    public final long retryAfterSeconds;
    public SignupException(HttpStatus status, String code, String message) {
        this(status, code, message, 60);
    }
    public SignupException(HttpStatus status, String code, String message, long retryAfterSeconds) {
        super(message); this.status = status; this.code = code; this.retryAfterSeconds = retryAfterSeconds;
    }
    public static SignupException conflict(String code, String message) {
        return new SignupException(HttpStatus.CONFLICT, code, message);
    }
    public static SignupException invalid(String code, String message) {
        return new SignupException(HttpStatus.BAD_REQUEST, code, message);
    }
}
