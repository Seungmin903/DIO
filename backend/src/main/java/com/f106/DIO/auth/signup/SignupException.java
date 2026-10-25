package com.f106.DIO.auth.signup;

import org.springframework.http.HttpStatus;

public class SignupException extends RuntimeException {
    final HttpStatus status;
    final String code;
    SignupException(HttpStatus status, String code, String message) {
        super(message); this.status = status; this.code = code;
    }
    static SignupException conflict(String code, String message) {
        return new SignupException(HttpStatus.CONFLICT, code, message);
    }
    static SignupException invalid(String code, String message) {
        return new SignupException(HttpStatus.BAD_REQUEST, code, message);
    }
}
