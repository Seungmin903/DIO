package com.f106.DIO.user.exception;
import org.springframework.http.HttpStatus;
public class UserException extends RuntimeException {
    public final HttpStatus status;
    public final String code;
    public UserException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    public static UserException invalid(String code, String message) { return new UserException(HttpStatus.BAD_REQUEST, code, message); }
    public static UserException conflict(String code, String message) { return new UserException(HttpStatus.CONFLICT, code, message); }
}
