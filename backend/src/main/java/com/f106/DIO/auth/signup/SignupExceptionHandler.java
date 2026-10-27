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
        if (error.retryAfterSeconds != null) response.header("Retry-After", Long.toString(error.retryAfterSeconds));
        return response.body(detail);
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail conflict(DataIntegrityViolationException error) {
        String constraint = null;
        String state = null;
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException violation) {
                constraint = violation.getConstraintName(); state = violation.getSQLState(); break;
            }
        }
        boolean duplicate = "23505".equals(state) && constraint != null && java.util.Set.of(
            "users_email_unique", "users_nickname_key_unique", "users_email_key", "users_nickname_key_key")
            .contains(constraint);
        if (!duplicate) {
            // SQL·예외 본문에는 이메일이나 해시가 포함될 수 있어 출력하지 않는다.
            org.slf4j.LoggerFactory.getLogger(getClass()).error(
                "Signup persistence failed: sqlState={}, constraint={}", safe(state), safe(constraint));
        }
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(duplicate ? HttpStatus.CONFLICT : HttpStatus.INTERNAL_SERVER_ERROR,
            duplicate ? "이메일 또는 닉네임이 이미 사용 중이에요." : "회원가입을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
        detail.setProperty("code", duplicate ? "SIGNUP_CONFLICT" : "SIGNUP_PERSISTENCE_FAILED");
        return detail;
    }
    private String safe(String value) { return value != null && value.matches("[A-Za-z0-9_]{1,100}") ? value : "unavailable"; }
}
