package com.f106.DIO.media.support;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.*;
import com.f106.DIO.media.controller.MediaController;
import com.f106.DIO.media.storage.MediaStorageException;

@RestControllerAdvice(assignableTypes = MediaController.class)
public class MediaExceptionHandler {
	@ExceptionHandler(MediaFileNotFoundException.class) public ProblemDetail notFound(MediaFileNotFoundException exception) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage()); problem.setTitle("Media file not found"); problem.setProperty("code", "MEDIA_FILE_NOT_FOUND"); return problem;
	}
	@ExceptionHandler(MediaRequestException.class) public ProblemDetail invalid(MediaRequestException exception) { return problem(exception.status(), exception.code(), exception.getMessage()); }
	@ExceptionHandler(MediaStorageException.class) public ProblemDetail storage(MediaStorageException exception) { return problem(exception.status(), exception.code(), exception.getMessage()); }
	private static ProblemDetail problem(HttpStatus status, String code, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail); problem.setTitle(status.getReasonPhrase()); problem.setProperty("code", code); return problem;
	}
}
