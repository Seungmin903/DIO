package com.f106.DIO.auth.exception;

import com.f106.DIO.auth.controller.PasswordResetController;
import com.f106.DIO.auth.exception.PasswordResetException;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice(assignableTypes = PasswordResetController.class)
public class PasswordResetExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(PasswordResetException.class)
    ResponseEntity<ProblemDetail> reset(PasswordResetException error) {
        var detail = ProblemDetail.forStatusAndDetail(error.status, error.getMessage()); detail.setProperty("code", error.code);
        var response = ResponseEntity.status(error.status).header("Cache-Control", "no-store");
        if (error.status == HttpStatus.TOO_MANY_REQUESTS) response.header("Retry-After", Integer.toString(error.retryAfter));
        return response.body(detail);
    }
}
