package com.f106.DIO.user.exception;

import com.f106.DIO.user.controller.UserController;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** 기존 회원 API의 입력 검증·MVC 오류 응답을 유지한다. */
@RestControllerAdvice(assignableTypes = UserController.class)
public class UserRequestExceptionHandler extends ResponseEntityExceptionHandler {
}
