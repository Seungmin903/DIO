package com.f106.DIO.user.exception;

import com.f106.DIO.user.controller.UserController;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
@RestControllerAdvice(assignableTypes = UserController.class)
public class UserExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(UserException.class)
    public ResponseEntity<ProblemDetail> user(UserException error) { return response(error); }
    public static ResponseEntity<ProblemDetail> response(UserException error) {
        var detail = ProblemDetail.forStatusAndDetail(error.status, error.getMessage()); detail.setProperty("code", error.code);
        return ResponseEntity.status(error.status).header("Cache-Control", "no-store").body(detail);
    }
}
