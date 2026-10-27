package com.f106.DIO.user.exception;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
/** UserException만 공통 처리하며 Spring MVC 입력 오류의 처리 범위는 넓히지 않는다. */
@RestControllerAdvice
public class UserExceptionHandler {
    @ExceptionHandler(UserException.class)
    public ResponseEntity<ProblemDetail> user(UserException error) {
        var detail = ProblemDetail.forStatusAndDetail(error.status, error.getMessage()); detail.setProperty("code", error.code);
        return ResponseEntity.status(error.status).header("Cache-Control", "no-store").body(detail);
    }
}
