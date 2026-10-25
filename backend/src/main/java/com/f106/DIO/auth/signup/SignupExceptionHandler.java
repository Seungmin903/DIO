package com.f106.DIO.auth.signup;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice(assignableTypes = SignupController.class)
public class SignupExceptionHandler extends ResponseEntityExceptionHandler {
    @ExceptionHandler(SignupException.class)
    public ResponseEntity<ProblemDetail> signup(SignupException error) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(error.status, error.getMessage());
        detail.setProperty("code", error.code);
        var response = ResponseEntity.status(error.status).header("Cache-Control", "no-store");
        if (error.status == HttpStatus.TOO_MANY_REQUESTS) response.header("Retry-After", "60");
        return response.body(detail);
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail conflict(DataIntegrityViolationException error) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
            "중복되거나 동시에 처리된 요청입니다. 이메일·닉네임을 확인한 뒤 다시 시도해 주세요.");
        detail.setProperty("code", "SIGNUP_CONFLICT");
        return detail;
    }
}
