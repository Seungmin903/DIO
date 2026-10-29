package com.f106.DIO.media.library.support;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.f106.DIO.diary.support.DiaryAccessDeniedException;
import com.f106.DIO.diary.support.DiaryNotFoundException;
import com.f106.DIO.media.library.controller.SharedMediaLibraryController;
import com.f106.DIO.media.support.MediaFileNotFoundException;
import com.f106.DIO.media.support.MediaRequestException;

@RestControllerAdvice(assignableTypes = SharedMediaLibraryController.class)
public class SharedMediaLibraryExceptionHandler {
	@ExceptionHandler(DiaryNotFoundException.class)
	ProblemDetail diaryNotFound(DiaryNotFoundException error) { return problem(HttpStatus.NOT_FOUND, "DIARY_NOT_FOUND", error.getMessage()); }
	@ExceptionHandler(DiaryAccessDeniedException.class)
	ProblemDetail denied(DiaryAccessDeniedException error) { return problem(HttpStatus.FORBIDDEN, "DIARY_ACCESS_DENIED", error.getMessage()); }
	@ExceptionHandler(MediaFileNotFoundException.class)
	ProblemDetail mediaNotFound(MediaFileNotFoundException error) { return problem(HttpStatus.NOT_FOUND, "MEDIA_FILE_NOT_FOUND", error.getMessage()); }
	@ExceptionHandler(SharedMediaLibraryException.class)
	ProblemDetail library(SharedMediaLibraryException error) { return problem(error.status(), error.code(), error.getMessage()); }
	@ExceptionHandler(MediaRequestException.class)
	ProblemDetail invalidRequest(MediaRequestException error) { return problem(error.status(), error.code(), error.getMessage()); }

	private static ProblemDetail problem(HttpStatus status, String code, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(status.getReasonPhrase());
		problem.setProperty("code", code);
		return problem;
	}
}
