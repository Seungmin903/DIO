package com.f106.DIO.user.exception;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
/**
 * 회원 서비스를 재사용하는 모든 컨트롤러에서 UserException을 처리하기 위해 의도적으로 전역 적용한다.
 * UserException만 처리하며 Exception 등 포괄적인 예외는 가로채지 않는다.
 * ResponseEntityExceptionHandler를 상속하지 않으므로 Spring MVC 입력 오류까지 전역 처리하지 않는다.
 * 회원 입력 오류는 UserRequestExceptionHandler, 인증·다이어리 오류는 각 도메인 advice가 담당한다.
 */
@RestControllerAdvice
public class UserExceptionHandler {
    @ExceptionHandler(UserException.class)
    public ResponseEntity<ProblemDetail> user(UserException error) {
        var detail = ProblemDetail.forStatusAndDetail(error.status, error.getMessage()); detail.setProperty("code", error.code);
        return ResponseEntity.status(error.status).header("Cache-Control", "no-store").body(detail);
    }
}
