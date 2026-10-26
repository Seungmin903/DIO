package com.f106.DIO.auth.reset;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice(assignableTypes = PasswordResetController.class)
class PasswordResetExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(PasswordResetException.class)
    ResponseEntity<ProblemDetail> reset(PasswordResetException error) {
        var detail = ProblemDetail.forStatusAndDetail(error.status, error.getMessage()); detail.setProperty("code", error.code);
        var response = ResponseEntity.status(error.status).header("Cache-Control", "no-store");
        if (error.status == HttpStatus.TOO_MANY_REQUESTS) response.header("Retry-After", Integer.toString(error.retryAfter));
        return response.body(detail);
    }
}
