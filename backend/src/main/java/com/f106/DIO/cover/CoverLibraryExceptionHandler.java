package com.f106.DIO.cover;

import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = CoverLibraryController.class)
public class CoverLibraryExceptionHandler {
    @ExceptionHandler(CoverLibraryException.class)
    public ResponseEntity<ProblemDetail> handle(CoverLibraryException exception) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(exception.status(), exception.getMessage());
        problem.setTitle(exception.status().getReasonPhrase());
        problem.setProperty("code", exception.code());
        return ResponseEntity.status(exception.status()).header("Cache-Control", "no-store").body(problem);
    }
}
