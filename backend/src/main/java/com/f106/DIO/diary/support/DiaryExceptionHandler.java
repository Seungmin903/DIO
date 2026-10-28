package com.f106.DIO.diary.support;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import com.f106.DIO.diary.controller.DiaryController;

@RestControllerAdvice(assignableTypes = DiaryController.class)
public class DiaryExceptionHandler extends ResponseEntityExceptionHandler {

	@ExceptionHandler(DiaryNotFoundException.class)
	public ProblemDetail handleNotFound(DiaryNotFoundException exception) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());
		problem.setTitle("Diary not found");
		problem.setProperty("code", "DIARY_NOT_FOUND");
		return problem;
	}

}
