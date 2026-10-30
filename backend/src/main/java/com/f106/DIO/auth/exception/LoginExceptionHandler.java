package com.f106.DIO.auth.exception;

import com.f106.DIO.auth.controller.LoginController;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice(assignableTypes = {LoginController.class, com.f106.DIO.auth.controller.PasswordChangeController.class})
public class LoginExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(LoginException.class)
    public ResponseEntity<ProblemDetail> login(LoginException error) {
        var detail = ProblemDetail.forStatusAndDetail(error.status, error.getMessage()); detail.setProperty("code", error.code);
        var response = ResponseEntity.status(error.status).header("Cache-Control", "no-store");
        if (error.status == HttpStatus.TOO_MANY_REQUESTS) response.header("Retry-After", "900");
        if (error.status == HttpStatus.UNAUTHORIZED) response.header("WWW-Authenticate", "Bearer");
        return response.body(detail);
    }
}
