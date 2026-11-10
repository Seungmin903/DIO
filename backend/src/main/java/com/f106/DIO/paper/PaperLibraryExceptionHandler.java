package com.f106.DIO.paper;

import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = PaperLibraryController.class)
public class PaperLibraryExceptionHandler {
    @ExceptionHandler(PaperLibraryException.class)
    public ResponseEntity<ProblemDetail> handle(PaperLibraryException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(exception.status(), exception.getMessage());
        problem.setTitle(exception.status().getReasonPhrase());
        problem.setProperty("code", exception.code());
        return ResponseEntity.status(exception.status()).header("Cache-Control", "no-store").body(problem);
    }
}
