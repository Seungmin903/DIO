package com.f106.DIO.push.controller;

import com.f106.DIO.auth.exception.LoginException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes=PushInstallationController.class)
public class PushExceptionHandler {
    @ExceptionHandler(LoginException.class)
    ResponseEntity<ProblemDetail> login(LoginException error) {
        var body=ProblemDetail.forStatusAndDetail(error.status,"다시 로그인해 주세요.");body.setProperty("code",error.code);
        return ResponseEntity.status(error.status).cacheControl(CacheControl.noStore()).header("WWW-Authenticate","Bearer").body(body);
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ProblemDetail> request(ResponseStatusException error) {
        var body=ProblemDetail.forStatusAndDetail(error.getStatusCode(),"기기 알림 설정을 확인해 주세요.");
        body.setProperty("code",error.getReason());
        return ResponseEntity.status(error.getStatusCode()).cacheControl(CacheControl.noStore()).body(body);
    }
}
