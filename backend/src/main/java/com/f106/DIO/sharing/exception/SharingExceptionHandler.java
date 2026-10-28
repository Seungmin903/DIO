package com.f106.DIO.sharing.exception;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
@RestControllerAdvice(basePackages="com.f106.DIO.sharing.controller")
public class SharingExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(SharingException.class)
    public ResponseEntity<ProblemDetail> sharing(SharingException error) {
        var detail=ProblemDetail.forStatusAndDetail(error.status,error.getMessage());detail.setProperty("code",error.code);
        if("DIARY_MEMBER_LIMIT_REACHED".equals(error.code)){detail.setProperty("currentMembers",com.f106.DIO.sharing.domain.SharingPolicy.MAX_MEMBERS);detail.setProperty("maxMembers",com.f106.DIO.sharing.domain.SharingPolicy.MAX_MEMBERS);}
        var response=ResponseEntity.status(error.status).header("Cache-Control","no-store");
        if(error.retryAfter!=null)response.header("Retry-After",error.retryAfter.toString());
        return response.body(detail);
    }
}
