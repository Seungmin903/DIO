package com.f106.DIO.moderation.exception;
import org.springframework.http.HttpStatus;
public class ModerationException extends RuntimeException {
 public final HttpStatus status; public final String code; public final Long retryAfter;
 public ModerationException(HttpStatus status,String code,String message){this(status,code,message,null);}
 public ModerationException(HttpStatus status,String code,String message,Long retryAfter){super(message);this.status=status;this.code=code;this.retryAfter=retryAfter;}
 public static ModerationException invalid(String message){return new ModerationException(HttpStatus.BAD_REQUEST,"INVALID_REPORT",message);}
 public static ModerationException missing(){return new ModerationException(HttpStatus.NOT_FOUND,"REPORT_TARGET_NOT_FOUND","신고·차단 가능한 멤버를 찾을 수 없어요.");}
}
