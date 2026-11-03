package com.f106.DIO.auth.exception;
import org.springframework.http.HttpStatus;
public class SocialLoginException extends RuntimeException {
    public final HttpStatus status;
    public final String code;
    public SocialLoginException(HttpStatus status,String code,String message){super(message);this.status=status;this.code=code;}
}
