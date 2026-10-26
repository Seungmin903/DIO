package com.f106.DIO.auth.signup;

import org.springframework.http.HttpStatus;

public class SignupException extends RuntimeException {
    final HttpStatus status;
    final String code;
    final long retryAfterSeconds;
    SignupException(HttpStatus status, String code, String message) {
        this(status, code, message, 60);
    }
    SignupException(HttpStatus status, String code, String message, long retryAfterSeconds) {
        super(message); this.status = status; this.code = code; this.retryAfterSeconds = retryAfterSeconds;
    }
    static SignupException conflict(String code, String message) {
        return new SignupException(HttpStatus.CONFLICT, code, message);
    }
    static SignupException invalid(String code, String message) {
        return new SignupException(HttpStatus.BAD_REQUEST, code, message);
    }
}
