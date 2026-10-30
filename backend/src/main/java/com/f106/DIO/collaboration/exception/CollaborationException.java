package com.f106.DIO.collaboration.exception;
import org.springframework.http.HttpStatus;
public class CollaborationException extends RuntimeException {
    public final HttpStatus status; public final String code;
    public CollaborationException(HttpStatus status,String code,String message){super(message);this.status=status;this.code=code;}
    public static CollaborationException conflict(){return new CollaborationException(HttpStatus.CONFLICT,"CANVAS_HISTORY_CONFLICT","다른 변경과 겹쳐 이 작업을 적용할 수 없어요. 최신 내용을 확인해 주세요.");}
    public static CollaborationException invalid(String message){return new CollaborationException(HttpStatus.BAD_REQUEST,"INVALID_CANVAS_OPERATION",message);}
    public static CollaborationException missing(){return new CollaborationException(HttpStatus.NOT_FOUND,"CANVAS_OPERATION_NOT_FOUND","적용할 작업을 찾을 수 없어요.");}
}
