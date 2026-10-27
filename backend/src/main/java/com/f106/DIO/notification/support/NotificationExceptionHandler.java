package com.f106.DIO.notification.support;

import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import com.f106.DIO.notification.controller.NotificationController;

@RestControllerAdvice(basePackageClasses = NotificationController.class)
public class NotificationExceptionHandler extends ResponseEntityExceptionHandler {

	@ExceptionHandler(NotificationException.class)
	public ProblemDetail handleNotification(NotificationException exception) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(exception.status(), exception.getMessage());
		problem.setTitle(exception.code());
		problem.setProperty("code", exception.code());
		return problem;
	}
}
