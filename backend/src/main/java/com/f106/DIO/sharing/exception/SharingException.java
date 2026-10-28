package com.f106.DIO.sharing.exception;
import org.springframework.http.HttpStatus;
public class SharingException extends RuntimeException {
    public final HttpStatus status; public final String code; public final Long retryAfter;
    public SharingException(HttpStatus status,String code,String message) {this(status,code,message,null);}
    public SharingException(HttpStatus status,String code,String message,Long retryAfter) {super(message);this.status=status;this.code=code;this.retryAfter=retryAfter;}
    public static SharingException forbidden() {return new SharingException(HttpStatus.FORBIDDEN,"DIARY_ACCESS_DENIED","다이어리 접근 권한이 없어요.");}
    public static SharingException missing() {return new SharingException(HttpStatus.NOT_FOUND,"DIARY_NOT_FOUND","다이어리를 찾을 수 없어요.");}
    public static SharingException invalid(String message) {return new SharingException(HttpStatus.BAD_REQUEST,"INVALID_SHARING_REQUEST",message);}
}
