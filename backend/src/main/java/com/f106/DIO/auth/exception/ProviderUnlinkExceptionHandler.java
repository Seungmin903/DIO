package com.f106.DIO.auth.exception;

import com.f106.DIO.auth.controller.MyProfileController;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Handles only the social-provider unlink endpoint without changing profile API errors. */
@RestControllerAdvice(assignableTypes=MyProfileController.class)
public class ProviderUnlinkExceptionHandler {
    @ExceptionHandler(SocialLoginException.class)
    public ResponseEntity<ProblemDetail> social(SocialLoginException error) {
        var detail=ProblemDetail.forStatusAndDetail(error.status,error.getMessage());
        detail.setProperty("code",error.code);
        return ResponseEntity.status(error.status).header("Cache-Control","no-store").body(detail);
    }
}
